use std::{cell::{Cell, RefCell}, collections::{BTreeMap, HashSet}, rc::Rc};

thread_local! {
    static BATCH_DEPTH: Cell<u32> = const { Cell::new(0) };
    static PENDING_SIGNALS: RefCell<Vec<Rc<dyn Fn()>>> = const { RefCell::new(Vec::new()) };
    // Effects are allowed to write signals, so a callback can synchronously
    // trigger itself. Keep the currently executing callbacks out of nested
    // notifications; this turns a direct reactive cycle into one stable
    // commit instead of unbounded recursion.
    static ACTIVE_EFFECTS: RefCell<HashSet<usize>> = RefCell::new(HashSet::new());
}

pub type Effect = Rc<dyn Fn()>;

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

impl<T: Clone> Signal<T> {
    pub fn get(&self) -> T {
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

    use super::{effect, signal};

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
}
