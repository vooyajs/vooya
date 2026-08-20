//! Runtime for `#[voo::store]` state components.
//!
//! The store handle owns the user's Rust state, keeps a subscription list,
//! and caches an identity-stable encoded snapshot. `useSyncExternalStore` (and
//! the Vue composable equivalent) require the snapshot to be `Object.is`
//! identical while state is unchanged, so notification is two-level:
//!
//! 1. a dirty bit set by every action dispatch, and
//! 2. a `PartialEq` comparison of the freshly built snapshot against the last
//!    cached one; equal snapshots keep the existing `JsValue` and notify no
//!    subscribers.
//!
//! One action that touches state several times still notifies once, because
//! `dispatch` flushes after the action returns. The pure decision logic
//! (`StoreCore`) is separated from the JavaScript encoding layer so the
//! identity and coalescing rules can be tested on the native target.

use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

use wasm_bindgen::JsValue;

use crate::{EventSink, ToJs};

/// Pure change-detection and notification logic, independent of `JsValue`.
struct StoreCore<T, S> {
    state: Rc<RefCell<T>>,
    snapshot_fn: Rc<dyn Fn(&T) -> S>,
    dirty: Cell<bool>,
    last_snapshot: RefCell<Option<S>>,
    subscribers: RefCell<Vec<(u32, Rc<dyn Fn()>)>>,
    next_id: Cell<u32>,
}

impl<T, S: Clone + PartialEq> StoreCore<T, S> {
    fn new(state: T, snapshot_fn: Rc<dyn Fn(&T) -> S>) -> Self {
        Self {
            state: Rc::new(RefCell::new(state)),
            snapshot_fn,
            dirty: Cell::new(false),
            last_snapshot: RefCell::new(None),
            subscribers: RefCell::new(Vec::new()),
            next_id: Cell::new(1),
        }
    }

    fn dispatch<R>(&self, action: impl FnOnce(&mut T) -> R) -> R {
        let result = action(&mut *self.state.borrow_mut());
        self.dirty.set(true);
        result
    }

    fn build_snapshot(&self) -> S {
        let state = self.state.borrow();
        (self.snapshot_fn)(&state)
    }

    /// Records the current snapshot and returns whether it differs from the
    /// previously recorded one. An unchanged snapshot means the encoded
    /// `JsValue` must be kept and no subscriber may be notified.
    fn capture(&self) -> bool {
        if !self.dirty.get() {
            return false;
        }
        self.dirty.set(false);
        let snapshot = self.build_snapshot();
        let unchanged = self
            .last_snapshot
            .borrow()
            .as_ref()
            .is_some_and(|last| *last == snapshot);
        if unchanged {
            return false;
        }
        *self.last_snapshot.borrow_mut() = Some(snapshot);
        true
    }

    fn snapshot_for_encoding(&self) -> S {
        if self.last_snapshot.borrow().is_none() {
            *self.last_snapshot.borrow_mut() = Some(self.build_snapshot());
        }
        self.last_snapshot.borrow().as_ref().expect("snapshot recorded").clone()
    }

    fn subscribe_impl(&self, callback: Rc<dyn Fn()>) -> u32 {
        let id = self.next_id.get();
        self.next_id.set(id + 1);
        self.subscribers.borrow_mut().push((id, callback));
        id
    }

    fn unsubscribe(&self, id: u32) {
        self.subscribers
            .borrow_mut()
            .retain(|(existing, _)| *existing != id);
    }

    fn dispose(&self) {
        self.subscribers.borrow_mut().clear();
        self.last_snapshot.borrow_mut().take();
    }

    fn notify_subscribers(&self) {
        let subscribers = self.subscribers.borrow();
        for (_, callback) in subscribers.iter() {
            callback();
        }
    }
}

/// The full store runtime: `StoreCore` plus props, the event sink, and the
/// cached encoded snapshot.
pub struct StoreRuntime<T, P, S> {
    core: StoreCore<T, S>,
    props: P,
    events: EventSink,
    cached_js: RefCell<Option<JsValue>>,
}

impl<T, P, S> StoreRuntime<T, P, S>
where
    S: Clone + PartialEq + ToJs,
{
    pub fn new(
        state: T,
        props: P,
        events: EventSink,
        snapshot_fn: Rc<dyn Fn(&T) -> S>,
    ) -> Self {
        Self {
            core: StoreCore::new(state, snapshot_fn),
            props,
            events,
            cached_js: RefCell::new(None),
        }
    }

    /// Runs one action and coalesces notification to a single flush after it
    /// returns.
    pub fn dispatch<R>(&self, action: impl FnOnce(&mut T) -> R) -> R {
        let result = self.core.dispatch(action);
        if self.core.capture() {
            self.rebuild_encoded();
            self.core.notify_subscribers();
        }
        result
    }

    /// Identity-stable snapshot for `useSyncExternalStore` / composables.
    pub fn snapshot_js(&self) -> JsValue {
        if let Some(js) = &*self.cached_js.borrow() {
            return js.clone();
        }
        let snapshot = self.core.snapshot_for_encoding();
        let encoded = snapshot
            .to_js()
            .expect("Vooya snapshot encoding must succeed");
        *self.cached_js.borrow_mut() = Some(encoded.clone());
        encoded
    }

    pub fn subscribe(&self, callback: js_sys::Function) -> u32 {
        self.core.subscribe_impl(Rc::new(move || {
            let _ = callback.call0(&JsValue::UNDEFINED);
        }))
    }

    pub fn unsubscribe(&self, id: u32) {
        self.core.unsubscribe(id);
    }

    pub fn dispose(&self) {
        self.core.dispose();
        self.cached_js.borrow_mut().take();
    }

    /// Accessors used by the generated store wrapper to inject `events` and
    /// `props` parameters into actions.
    pub fn events(&self) -> &EventSink {
        &self.events
    }

    pub fn props(&self) -> &P {
        &self.props
    }

    fn rebuild_encoded(&self) {
        let snapshot = self.core.snapshot_for_encoding();
        let encoded = snapshot
            .to_js()
            .expect("Vooya snapshot encoding must succeed");
        *self.cached_js.borrow_mut() = Some(encoded);
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::Cell, rc::Rc};

    use crate::{EventSink, FromJs, ToJs};

    #[derive(Clone, PartialEq, Debug)]
    struct Snapshot {
        total: i32,
    }

    impl ToJs for Snapshot {
        fn to_js(&self) -> Result<wasm_bindgen::JsValue, wasm_bindgen::JsValue> {
            Ok(wasm_bindgen::JsValue::from_f64(self.total as f64))
        }
    }

    #[derive(Debug)]
    struct Cart {
        items: Vec<String>,
    }

    struct Props;

    struct Harness {
        runtime: super::StoreRuntime<Cart, Props, Snapshot>,
    }

    impl Harness {
        fn new() -> Self {
            let runtime = super::StoreRuntime::<Cart, Props, Snapshot>::new(
                Cart { items: Vec::new() },
                Props,
                EventSink::new(|_, _| {}),
                Rc::new(|cart| Snapshot { total: cart.items.len() as i32 }),
            );
            Self { runtime }
        }

        fn subscribe_count(&self) -> Rc<Cell<i32>> {
            let count = Rc::new(Cell::new(0));
            let inner = count.clone();
            self.runtime.core.subscribe_impl(Rc::new(move || {
                inner.set(inner.get() + 1);
            }));
            count
        }

        fn notify_would_reexpress(&self, action: impl FnOnce(&mut Cart)) -> bool {
            self.runtime.core.dispatch(action);
            let changed = self.runtime.core.capture();
            if changed {
                self.runtime.core.notify_subscribers();
            }
            changed
        }
    }

    #[test]
    fn noop_actions_do_not_notify() {
        let harness = Harness::new();
        let notified = harness.subscribe_count();

        // Mirror real usage: the consumer reads the snapshot before any action.
        harness.runtime.core.snapshot_for_encoding();

        assert!(!harness.notify_would_reexpress(|_| {}), "no-op action is a no-op");
        assert_eq!(notified.get(), 0);

        assert!(
            harness.notify_would_reexpress(|cart| cart.items.push("a".into())),
            "a real change must notify"
        );
        assert_eq!(notified.get(), 1);

        assert!(
            !harness.notify_would_reexpress(|cart| {
                cart.items.clear();
                cart.items.push("a".into());
            }),
            "net-zero mutation keeps the encoded snapshot identity"
        );
        assert_eq!(notified.get(), 1);
    }

    #[test]
    fn multiple_touches_coalesce_to_one_notification() {
        let harness = Harness::new();
        let notified = harness.subscribe_count();

        assert!(harness.notify_would_reexpress(|cart| {
            cart.items.push("a".into());
            cart.items.push("b".into());
        }));
        assert_eq!(notified.get(), 1, "multiple touches notify once");
    }

    #[test]
    fn unsubscribe_stops_notifications() {
        let harness = Harness::new();
        let count = Rc::new(Cell::new(0));
        let inner = count.clone();
        let id = harness.runtime.core.subscribe_impl(Rc::new(move || {
            inner.set(inner.get() + 1);
        }));
        harness.runtime.unsubscribe(id);

        assert!(harness.notify_would_reexpress(|cart| cart.items.push("a".into())));
        assert_eq!(count.get(), 0);
    }

    #[test]
    fn snapshot_for_encoding_is_identity_stable() {
        let harness = Harness::new();
        let first = harness.runtime.core.snapshot_for_encoding();
        let second = harness.runtime.core.snapshot_for_encoding();
        assert_eq!(first, second, "idle reads must be identity stable");

        assert!(harness.notify_would_reexpress(|cart| cart.items.push("a".into())));
        let after = harness.runtime.core.snapshot_for_encoding();
        assert_ne!(first, after, "an actual change must re-encode");
    }

    // Silence unused import warnings from the trait prelude used by macros.
    #[allow(dead_code)]
    fn _trait_prelude() {
        fn check<T: ToJs + FromJs>() {}
        let _ = check::<i32>;
    }
}
