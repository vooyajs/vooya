//! Instance-scoped store state, snapshot caching, and synchronous notification.

use std::{
    cell::{Cell, RefCell},
    collections::BTreeMap,
    rc::Rc,
};

use wasm_bindgen::JsValue;

use crate::ToJs;

/// State which can expose a stable, host-visible snapshot.
pub trait StoreState {
    type Snapshot: Clone + PartialEq + ToJs;

    fn snapshot(&self) -> Self::Snapshot;
}

type Listener = Rc<dyn Fn()>;

struct Inner<T: StoreState> {
    state: RefCell<T>,
    snapshot: RefCell<T::Snapshot>,
    cached_js: RefCell<Option<JsValue>>,
    listeners: RefCell<BTreeMap<u64, Listener>>,
    domain_listeners: RefCell<BTreeMap<u64, Rc<dyn Fn(&str, JsValue)>>>,
    next_listener: Cell<u64>,
    next_domain_listener: Cell<u64>,
    notifying: Cell<bool>,
    pending_notification: Cell<bool>,
    disposed: Cell<bool>,
}

/// One owned store instance. Cloning the handle refers to the same instance.
pub struct Store<T: StoreState> {
    inner: Rc<Inner<T>>,
}

impl<T: StoreState> Clone for Store<T> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
        }
    }
}

/// A registration returned by [`Store::subscribe`]. Dropping it unregisters the
/// listener; explicit `unsubscribe` is useful when a host owns its lifecycle.
pub struct Subscription<T: StoreState> {
    store: Store<T>,
    id: u64,
    active: bool,
}

/// A registration for domain events. These are deliberately separate from the
/// store-change subscription used to consume snapshots.
pub struct DomainSubscription<T: StoreState> {
    store: Store<T>,
    id: u64,
    active: bool,
}

impl<T: StoreState> Store<T> {
    pub fn new(state: T) -> Self {
        let snapshot = state.snapshot();
        Self {
            inner: Rc::new(Inner {
                state: RefCell::new(state),
                snapshot: RefCell::new(snapshot),
                cached_js: RefCell::new(None),
                listeners: RefCell::new(BTreeMap::new()),
                domain_listeners: RefCell::new(BTreeMap::new()),
                next_listener: Cell::new(0),
                next_domain_listener: Cell::new(0),
                notifying: Cell::new(false),
                pending_notification: Cell::new(false),
                disposed: Cell::new(false),
            }),
        }
    }

    /// Runs one synchronous action. Errors returned by `action` are returned as
    /// written: a mutation is never automatically rolled back.
    pub fn dispatch<R>(&self, action: impl FnOnce(&mut T) -> R) -> R {
        let result = action(&mut self.inner.state.borrow_mut());
        self.refresh_snapshot();
        result
    }

    pub fn snapshot(&self) -> T::Snapshot {
        self.inner.snapshot.borrow().clone()
    }

    /// Returns the cached JavaScript snapshot. It preserves JS identity until a
    /// changed Rust snapshot commits, which is required by host subscriptions.
    pub fn snapshot_js(&self) -> Result<JsValue, JsValue> {
        if let Some(value) = self.inner.cached_js.borrow().as_ref() {
            return Ok(value.clone());
        }
        let value = self.inner.snapshot.borrow().to_js()?;
        *self.inner.cached_js.borrow_mut() = Some(value.clone());
        Ok(value)
    }

    pub fn subscribe(&self, listener: impl Fn() + 'static) -> Subscription<T> {
        let id = self.inner.next_listener.get();
        self.inner.next_listener.set(id.wrapping_add(1));
        if !self.inner.disposed.get() {
            self.inner
                .listeners
                .borrow_mut()
                .insert(id, Rc::new(listener));
        }
        Subscription {
            store: self.clone(),
            id,
            active: true,
        }
    }

    pub fn unsubscribe(&self, id: u64) {
        self.inner.listeners.borrow_mut().remove(&id);
    }

    pub fn subscribe_domain(
        &self,
        listener: impl Fn(&str, JsValue) + 'static,
    ) -> DomainSubscription<T> {
        let id = self.inner.next_domain_listener.get();
        self.inner.next_domain_listener.set(id.wrapping_add(1));
        if !self.inner.disposed.get() {
            self.inner
                .domain_listeners
                .borrow_mut()
                .insert(id, Rc::new(listener));
        }
        DomainSubscription {
            store: self.clone(),
            id,
            active: true,
        }
    }

    /// Delivers a domain event after the caller's `dispatch` boundary. Domain
    /// events never substitute for a snapshot-change notification.
    pub fn emit_domain(&self, name: &str, payload: JsValue) {
        if self.inner.disposed.get() {
            return;
        }
        let listeners = self
            .inner
            .domain_listeners
            .borrow()
            .values()
            .cloned()
            .collect::<Vec<_>>();
        for listener in listeners {
            listener(name, payload.clone());
        }
    }

    pub fn dispose(&self) {
        if self.inner.disposed.replace(true) {
            return;
        }
        self.inner.listeners.borrow_mut().clear();
        self.inner.domain_listeners.borrow_mut().clear();
        self.inner.cached_js.borrow_mut().take();
    }

    pub fn is_disposed(&self) -> bool {
        self.inner.disposed.get()
    }

    fn refresh_snapshot(&self) {
        if self.inner.disposed.get() {
            return;
        }
        let next = self.inner.state.borrow().snapshot();
        if next == *self.inner.snapshot.borrow() {
            return;
        }
        *self.inner.snapshot.borrow_mut() = next;
        self.inner.cached_js.borrow_mut().take();
        self.request_notification();
    }

    fn request_notification(&self) {
        if self.inner.notifying.get() {
            self.inner.pending_notification.set(true);
            return;
        }
        self.inner.notifying.set(true);
        loop {
            self.inner.pending_notification.set(false);
            let ids = self
                .inner
                .listeners
                .borrow()
                .keys()
                .copied()
                .collect::<Vec<_>>();
            for id in ids {
                // Re-read each registration. If an earlier listener removed it,
                // it must not receive this notification round.
                let listener = self.inner.listeners.borrow().get(&id).cloned();
                if let Some(listener) = listener {
                    listener();
                }
            }
            if !self.inner.pending_notification.get() {
                break;
            }
        }
        self.inner.notifying.set(false);
    }
}

impl<T: StoreState> DomainSubscription<T> {
    pub fn unsubscribe(&mut self) {
        if self.active {
            self.store
                .inner
                .domain_listeners
                .borrow_mut()
                .remove(&self.id);
            self.active = false;
        }
    }
}

impl<T: StoreState> Drop for DomainSubscription<T> {
    fn drop(&mut self) {
        self.unsubscribe();
    }
}

impl<T: StoreState> Subscription<T> {
    pub fn unsubscribe(&mut self) {
        if self.active {
            self.store.unsubscribe(self.id);
            self.active = false;
        }
    }
}

impl<T: StoreState> Drop for Subscription<T> {
    fn drop(&mut self) {
        self.unsubscribe();
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::Cell, rc::Rc};

    use super::{Store, StoreState};

    struct Counter {
        value: u32,
    }

    impl StoreState for Counter {
        type Snapshot = u32;

        fn snapshot(&self) -> Self::Snapshot {
            self.value
        }
    }

    #[test]
    fn changed_snapshots_notify_once_and_equal_snapshots_do_not_notify() {
        let store = Store::new(Counter { value: 1 });
        let calls = Rc::new(Cell::new(0));
        let observed = calls.clone();
        let _subscription = store.subscribe(move || observed.set(observed.get() + 1));

        store.dispatch(|_| {});
        store.dispatch(|counter| counter.value = 2);

        assert_eq!(store.snapshot(), 2);
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn listener_can_unsubscribe_a_later_listener_during_notification() {
        let store = Store::new(Counter { value: 0 });
        let second_id = Rc::new(Cell::new(u64::MAX));
        let remove_second = store.clone();
        let id_for_first = second_id.clone();
        let _first = store.subscribe(move || remove_second.unsubscribe(id_for_first.get()));
        let called = Rc::new(Cell::new(false));
        let called_by_second = called.clone();
        let second = store.subscribe(move || called_by_second.set(true));
        second_id.set(second.id);

        store.dispatch(|counter| counter.value = 1);

        assert!(!called.get());
    }

    #[test]
    fn dispose_is_idempotent_and_stops_future_notifications() {
        let store = Store::new(Counter { value: 0 });
        let calls = Rc::new(Cell::new(0));
        let observed = calls.clone();
        let _subscription = store.subscribe(move || observed.set(observed.get() + 1));
        store.dispose();
        store.dispose();
        store.dispatch(|counter| counter.value = 1);

        assert!(store.is_disposed());
        assert_eq!(calls.get(), 0);
    }
}
