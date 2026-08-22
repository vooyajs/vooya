use std::{cell::{Cell, RefCell}, collections::{BTreeMap, HashSet}, rc::Rc};

thread_local! {
    static BATCH_DEPTH: Cell<u32> = const { Cell::new(0) };
    static PENDING_SIGNALS: RefCell<Vec<Rc<dyn Fn()>>> = const { RefCell::new(Vec::new()) };
    // Effects are allowed to write signals, so a callback can synchronously
    // trigger itself. Keep the currently executing callbacks out of nested
    // notifications; this turns a direct reactive cycle into one stable
    // commit instead of unbounded recursion.
    static ACTIVE_EFFECTS: RefCell<HashSet<usize>> = RefCell::new(HashSet::new());
    static CURRENT_TRACKER: RefCell<Option<Rc<TrackedEffectState>>> = const { RefCell::new(None) };
}

pub type Effect = Rc<dyn Fn()>;

struct TrackedEffectState {
    user_callback: Effect,
    runner: RefCell<Option<Effect>>,
    subscriptions: RefCell<Vec<Box<dyn FnOnce()>>>,
    dependencies: RefCell<HashSet<usize>>,
}

/// An effect whose signal dependencies are collected from `Signal::get()`.
/// Dependencies are replaced on every run, so conditional reads switch
/// subscriptions without retaining stale branches.
pub struct TrackedEffect {
    state: Rc<TrackedEffectState>,
}

impl TrackedEffectState {
    fn run(self: &Rc<Self>) {
        self.clear();
        let previous = CURRENT_TRACKER.with(|current| current.replace(Some(self.clone())));
        (self.user_callback)();
        CURRENT_TRACKER.with(|current| current.replace(previous));
    }

    fn clear(&self) {
        self.dependencies.borrow_mut().clear();
        for unsubscribe in self.subscriptions.borrow_mut().drain(..) {
            unsubscribe();
        }
    }

    fn track<T>(self: &Rc<Self>, signal: &Signal<T>) {
        let identity = Rc::as_ptr(&signal.effects) as usize;
        if !self.dependencies.borrow_mut().insert(identity) {
            return;
        }
        let Some(runner) = self.runner.borrow().as_ref().cloned() else {
            return;
        };
        self.subscriptions
            .borrow_mut()
            .push(signal.subscribe_callback(runner));
    }
}

impl Drop for TrackedEffect {
    fn drop(&mut self) {
        self.state.clear();
    }
}

/// Single-threaded reactive state for browser components.
pub struct Signal<T> {
    value: Rc<RefCell<T>>,
    effects: Rc<RefCell<BTreeMap<u64, Effect>>>,
    next_effect: Rc<Cell<u64>>,
    pending: Rc<Cell<bool>>,
}

impl<T> Clone for Signal<T> {
    fn clone(&self) -> Self {
        Self {
            value: self.value.clone(),
            effects: self.effects.clone(),
            next_effect: self.next_effect.clone(),
            pending: self.pending.clone(),
        }
    }
}

/// A subscription owned by one signal consumer. Dropping it unregisters the
/// callback, which makes branch and component cleanup deterministic.
pub struct SignalSubscription<T> {
    signal: Signal<T>,
    id: u64,
    active: bool,
}

pub fn signal<T>(value: T) -> Signal<T> {
    Signal {
        value: Rc::new(RefCell::new(value)),
        effects: Rc::new(RefCell::new(BTreeMap::new())),
        next_effect: Rc::new(Cell::new(0)),
        pending: Rc::new(Cell::new(false)),
    }
}

/// Runs synchronous signal writes as one transaction. Subscribers are
/// notified once per changed signal after the outermost batch completes.
pub fn batch(action: impl FnOnce()) {
    BATCH_DEPTH.with(|depth| depth.set(depth.get().saturating_add(1)));
    action();
    let outermost = BATCH_DEPTH.with(|depth| {
        let next = depth.get().saturating_sub(1);
        depth.set(next);
        next == 0
    });
    if !outermost {
        return;
    }
    loop {
        let pending = PENDING_SIGNALS.with(|signals| std::mem::take(&mut *signals.borrow_mut()));
        if pending.is_empty() {
            break;
        }
        for signal in pending {
            signal();
        }
    }
}

pub fn effect(callback: impl Fn() + 'static) -> Effect {
    Rc::new(callback)
}

/// Runs `callback` immediately and subscribes it to every signal read through
/// `Signal::get()`. The returned handle owns those subscriptions.
pub fn tracked_effect(callback: impl Fn() + 'static) -> TrackedEffect {
    let user_callback: Effect = Rc::new(callback);
    let state = Rc::new(TrackedEffectState {
        user_callback,
        runner: RefCell::new(None),
        subscriptions: RefCell::new(Vec::new()),
        dependencies: RefCell::new(HashSet::new()),
    });
    let weak = Rc::downgrade(&state);
    let runner: Effect = Rc::new(move || {
        if let Some(state) = weak.upgrade() {
            state.run();
        }
    });
    *state.runner.borrow_mut() = Some(runner);
    state.run();
    TrackedEffect { state }
}

impl<T: Clone> Signal<T> {
    pub fn get(&self) -> T {
        CURRENT_TRACKER.with(|current| {
            if let Some(tracker) = current.borrow().as_ref() {
                tracker.track(self);
            }
        });
        self.value.borrow().clone()
    }
}

impl<T> Signal<T> {
    pub fn set(&self, value: T) {
        *self.value.borrow_mut() = value;
        self.notify();
    }

    pub fn update(&self, update: impl FnOnce(&mut T)) {
        update(&mut self.value.borrow_mut());
        self.notify();
    }

    pub fn subscribe(&self, callback: Effect) -> SignalSubscription<T> {
        let id = self.next_effect.get();
        self.next_effect.set(id.wrapping_add(1));
        self.effects.borrow_mut().insert(id, callback);
        SignalSubscription { signal: self.clone(), id, active: true }
    }

    fn subscribe_callback(&self, callback: Effect) -> Box<dyn FnOnce()> {
        let id = self.next_effect.get();
        self.next_effect.set(id.wrapping_add(1));
        self.effects.borrow_mut().insert(id, callback);
        let effects = self.effects.clone();
        Box::new(move || {
            effects.borrow_mut().remove(&id);
        })
    }

    pub fn unsubscribe(&self, id: u64) {
        self.effects.borrow_mut().remove(&id);
    }

    fn notify(&self) {
        if BATCH_DEPTH.with(|depth| depth.get() > 0) {
            if !self.pending.replace(true) {
                let effects = self.effects.clone();
                let pending = self.pending.clone();
                PENDING_SIGNALS.with(|signals| signals.borrow_mut().push(Rc::new(move || flush_effects(&effects, &pending))));
            }
            return;
        }
        self.flush();
    }

    fn flush(&self) {
        flush_effects(&self.effects, &self.pending);
    }
}

fn flush_effects(effects: &Rc<RefCell<BTreeMap<u64, Effect>>>, pending: &Rc<Cell<bool>>) {
    pending.set(false);
    let ids = effects.borrow().keys().copied().collect::<Vec<_>>();
    for id in ids {
        let callback = effects.borrow().get(&id).cloned();
        if let Some(callback) = callback {
            let identity = Rc::as_ptr(&callback) as *const () as usize;
            let entered = ACTIVE_EFFECTS.with(|active| active.borrow_mut().insert(identity));
            if !entered {
                continue;
            }
            callback();
            ACTIVE_EFFECTS.with(|active| {
                active.borrow_mut().remove(&identity);
            });
        }
    }
}

impl<T> SignalSubscription<T> {
    pub fn unsubscribe(&mut self) {
        if self.active {
            self.signal.unsubscribe(self.id);
            self.active = false;
        }
    }
}

impl<T> Drop for SignalSubscription<T> {
    fn drop(&mut self) {
        self.unsubscribe();
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::Cell, rc::Rc};

    use super::{effect, signal, tracked_effect};

    #[test]
    fn signals_run_subscribed_effects_after_updates() {
        let count = signal(1);
        let seen = Rc::new(Cell::new(0));
        let seen_in_effect = seen.clone();
        let count_in_effect = count.clone();
        let _subscription = count.subscribe(effect(move || seen_in_effect.set(count_in_effect.get())));

        count.update(|value| *value += 2);

        assert_eq!(count.get(), 3);
        assert_eq!(seen.get(), 3);
    }

    #[test]
    fn dropping_a_subscription_removes_the_effect() {
        let count = signal(1);
        let calls = Rc::new(Cell::new(0));
        let observed = calls.clone();
        let subscription = count.subscribe(effect(move || observed.set(observed.get() + 1)));
        count.set(2);
        assert_eq!(calls.get(), 1);
        drop(subscription);
        count.set(3);
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn an_effect_can_unsubscribe_a_later_effect_during_notification() {
        let count = signal(0);
        let second_id = Rc::new(Cell::new(u64::MAX));
        let remove_second = count.clone();
        let id = second_id.clone();
        let _first = count.subscribe(effect(move || remove_second.unsubscribe(id.get())));
        let called = Rc::new(Cell::new(false));
        let observed = called.clone();
        let second = count.subscribe(effect(move || observed.set(true)));
        second_id.set(second.id);
        count.set(1);
        assert!(!called.get());
    }

    #[test]
    fn batch_coalesces_multiple_writes_to_one_notification() {
        let count = signal(0);
        let calls = Rc::new(Cell::new(0));
        let observed = calls.clone();
        let _subscription = count.subscribe(effect(move || observed.set(observed.get() + 1)));

        super::batch(|| {
            count.set(1);
            count.set(2);
        });

        assert_eq!(count.get(), 2);
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn a_reentrant_effect_cycle_is_suppressed() {
        let count = signal(0);
        let runs = Rc::new(Cell::new(0));
        let observed = runs.clone();
        let next = count.clone();
        let _subscription = count.subscribe(effect(move || {
            observed.set(observed.get() + 1);
            next.set(next.get() + 1);
        }));

        count.set(1);

        assert_eq!(runs.get(), 1);
        assert_eq!(count.get(), 2);
    }

    #[test]
    fn tracked_effect_switches_conditional_dependencies() {
        let use_first = signal(true);
        let first = signal(1);
        let second = signal(10);
        let tracked_use_first = use_first.clone();
        let tracked_first = first.clone();
        let tracked_second = second.clone();
        let seen = Rc::new(Cell::new(0));
        let observed = seen.clone();
        let _tracked = tracked_effect(move || {
            observed.set(if tracked_use_first.get() { tracked_first.get() } else { tracked_second.get() });
        });

        assert_eq!(seen.get(), 1);
        first.set(2);
        assert_eq!(seen.get(), 2);
        use_first.set(false);
        assert_eq!(seen.get(), 10);
        first.set(3);
        assert_eq!(seen.get(), 10);
        second.set(11);
        assert_eq!(seen.get(), 11);
    }

    #[test]
    fn dropping_tracked_effect_removes_automatic_dependencies() {
        let count = signal(0);
        let tracked_count = count.clone();
        let runs = Rc::new(Cell::new(0));
        let observed = runs.clone();
        let tracked = tracked_effect(move || {
            let _ = tracked_count.get();
            observed.set(observed.get() + 1);
        });
        assert_eq!(runs.get(), 1);
        drop(tracked);
        count.set(1);
        assert_eq!(runs.get(), 1);
    }

    #[test]
    fn tracked_effect_deduplicates_repeated_reads() {
        let count = signal(1);
        let runs = Rc::new(Cell::new(0));
        let observed = runs.clone();
        let tracked_count = count.clone();
        let _tracked = tracked_effect(move || {
            let _ = tracked_count.get();
            let _ = tracked_count.get();
            observed.set(observed.get() + 1);
        });

        count.set(2);
        assert_eq!(runs.get(), 2);
    }
}
