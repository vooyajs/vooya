use wasm_bindgen::{JsCast, JsValue, closure::Closure};
use web_sys::{CustomEvent, CustomEventInit, Document, Element, Event, EventTarget, Node};

use crate::{Signal, SignalSubscription, effect};

/// Cleanup callbacks owned by one generated component mount attempt.
///
/// Generated bindings run this scope if `mount` returns an error and disarm it
/// once the component handle has been stored. Component authors may register
/// cleanup for resources which are not otherwise owned by their `Component`.
#[derive(Clone, Default)]
pub struct MountCleanup {
    callbacks: std::rc::Rc<std::cell::RefCell<Vec<Box<dyn FnOnce()>>>>,
}

impl MountCleanup {
    pub fn defer(&self, callback: impl FnOnce() + 'static) {
        self.callbacks.borrow_mut().push(Box::new(callback));
    }

    pub fn run(&self) {
        let callbacks = std::mem::take(&mut *self.callbacks.borrow_mut());
        for callback in callbacks.into_iter().rev() {
            callback();
        }
    }

    pub fn disarm(&self) {
        self.callbacks.borrow_mut().clear();
    }
}

/// Creates and owns DOM nodes below a framework-provided component host.
pub struct View {
    document: Document,
    host: Element,
}

impl View {
    pub fn from_host(host: &Element) -> Result<Self, JsValue> {
        let document = host
            .owner_document()
            .ok_or_else(|| JsValue::from_str("Vooya mount host has no document"))?;
        Ok(Self { document, host: host.clone() })
    }

    pub fn element(&self, tag: &str) -> Result<ViewElement, JsValue> {
        self.document.create_element(tag).map(ViewElement::new)
    }

    /// Dispatches a non-bubbling event across the framework adapter boundary.
    /// The adapter listens on the host element for the `vooya-` event name.
    pub fn emit(&self, event_name: &str, detail: JsValue) -> Result<(), JsValue> {
        let init = CustomEventInit::new();
        init.set_bubbles(false);
        init.set_detail(&detail);
        let event = CustomEvent::new_with_event_init_dict(&format!("vooya-{event_name}"), &init)?;
        self.host.dispatch_event(&event)?;
        Ok(())
    }
}

/// A small, cloneable handle to an element owned by a Vooya component.
#[derive(Clone)]
pub struct ViewElement {
    element: Element,
    cleanup: MountCleanup,
}

impl ViewElement {
    fn new(element: Element) -> Self {
        Self { element, cleanup: MountCleanup::default() }
    }

    pub fn class(self, class_name: &str) -> Self {
        self.element.set_class_name(class_name);
        self
    }

    pub fn attribute(self, name: &str, value: &str) -> Result<Self, JsValue> {
        self.element.set_attribute(name, value)?;
        Ok(self)
    }

    pub fn text(self, value: &str) -> Self {
        self.element.set_text_content(Some(value));
        self
    }

    pub fn set_text(&self, value: &str) {
        self.element.set_text_content(Some(value));
    }

    /// Bind this element's text to a signal. The returned subscription is
    /// owned by the element and released when its root is removed.
    pub fn bind_text<T>(&self, signal: &Signal<T>)
    where
        T: Clone + ::core::fmt::Display + 'static,
    {
        let signal = signal.clone();
        self.set_text(&signal.get().to_string());
        let element = self.clone();
        let subscription: SignalSubscription<T> = signal.clone().subscribe(effect(move || {
            element.set_text(&signal.get().to_string());
        }));
        self.cleanup.defer(move || drop(subscription));
    }

    /// Bind an attribute value to a signal and release the subscription with
    /// the owning element.
    pub fn bind_attribute<T>(&self, name: &str, signal: &Signal<T>) -> Result<(), JsValue>
    where
        T: Clone + ::core::fmt::Display + 'static,
    {
        let signal = signal.clone();
        self.element.set_attribute(name, &signal.get().to_string())?;
        let element = self.clone();
        let name = name.to_owned();
        let subscription: SignalSubscription<T> = signal.clone().subscribe(effect(move || {
            let _ = element.element.set_attribute(&name, &signal.get().to_string());
        }));
        self.cleanup.defer(move || drop(subscription));
        Ok(())
    }

    pub fn as_element(&self) -> &Element {
        &self.element
    }

    pub fn append(&self, child: &ViewElement) -> Result<(), JsValue> {
        let child_cleanup = child.cleanup.clone();
        self.cleanup.defer(move || child_cleanup.run());
        self.element.append_child(&child.element).map(|_| ())
    }

    /// Move an already-owned child before another child without changing its
    /// cleanup owner. This is the primitive keyed list reconciliation uses for
    /// stable DOM identity.
    pub fn insert_before(
        &self,
        child: &ViewElement,
        reference: Option<&ViewElement>,
    ) -> Result<(), JsValue> {
        let parent: Node = self.element.clone().unchecked_into();
        let child: Node = child.element.clone().unchecked_into();
        let reference = reference.map(|value| value.element.clone().unchecked_into::<Node>());
        parent.insert_before(&child, reference.as_ref()).map(|_| ())
    }

    /// Remove one child and release the subscriptions/listeners owned by it.
    pub fn remove_child(&self, child: &ViewElement) -> Result<(), JsValue> {
        child.cleanup.run();
        let parent: Node = self.element.clone().unchecked_into();
        let child: Node = child.element.clone().unchecked_into();
        parent.remove_child(&child).map(|_| ())
    }

    /// Replace one branch root while preserving the parent's cleanup scope.
    pub fn replace_child(
        &self,
        current: &ViewElement,
        next: Option<&ViewElement>,
    ) -> Result<(), JsValue> {
        self.remove_child(current)?;
        if let Some(next) = next {
            self.append(next)?;
        }
        Ok(())
    }

    pub fn mount(&self, host: &Element) -> Result<(), JsValue> {
        host.append_child(&self.element).map(|_| ())
    }

    pub fn on(
        &self,
        event_name: &str,
        handler: impl FnMut(Event) + 'static,
    ) -> Result<EventListener, JsValue> {
        let target: EventTarget = self.element.clone().unchecked_into();
        let callback = Closure::new(handler);
        target.add_event_listener_with_callback(event_name, callback.as_ref().unchecked_ref())?;
        Ok(EventListener {
            target,
            event_name: event_name.to_owned(),
            callback,
        })
    }

    /// Register an event listener owned by this element. It is removed when
    /// the element's cleanup scope runs.
    pub fn on_owned(
        &self,
        event_name: &str,
        handler: impl FnMut(Event) + 'static,
    ) -> Result<(), JsValue> {
        let listener = self.on(event_name, handler)?;
        self.cleanup.defer(move || drop(listener));
        Ok(())
    }

    pub fn remove(&self) {
        self.cleanup.run();
        self.element.remove();
    }
}

/// Keeps a browser event callback alive and unregisters it when dropped.
pub struct EventListener {
    target: EventTarget,
    event_name: String,
    callback: Closure<dyn FnMut(Event)>,
}

impl Drop for EventListener {
    fn drop(&mut self) {
        let _ = self.target.remove_event_listener_with_callback(
            &self.event_name,
            self.callback.as_ref().unchecked_ref(),
        );
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, rc::Rc};

    use super::MountCleanup;

    #[test]
    fn mount_cleanup_runs_deferred_callbacks_once_in_reverse_order() {
        let cleanup = MountCleanup::default();
        let calls = Rc::new(RefCell::new(Vec::new()));
        for value in [1, 2] {
            let calls = calls.clone();
            cleanup.defer(move || calls.borrow_mut().push(value));
        }
        cleanup.run();
        cleanup.run();
        assert_eq!(*calls.borrow(), vec![2, 1]);
    }
}
