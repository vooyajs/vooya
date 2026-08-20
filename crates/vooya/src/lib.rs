//! Vooya user-facing runtime.
//!
//! `vooya` is the crate that component authors write against. It re-exports
//! the low-level browser runtime from `vooya-core`, the procedural macros from
//! `vooya-macros`, and adds the ABI vocabulary (props, events, structured
//! types) and the state-store runtime.
//!
//! ```rust,ignore
//! use vooya::prelude::*;
//! ```

pub use vooya_core::{Effect, EventListener, MountCleanup, Signal, View, ViewElement, effect, signal};
pub use vooya_macros::{Props, events};

use std::{cell::RefCell, rc::Rc};

use wasm_bindgen::{JsCast, JsValue};
use web_sys::{CustomEvent, CustomEventInit, Element};

/// Directional decode of a JSON-compatible value from `JsValue`.
pub trait FromJs: Sized {
    fn from_js(value: &JsValue) -> Result<Self, JsValue>;
}

/// Directional encode of a JSON-compatible value to `JsValue`.
pub trait ToJs {
    fn to_js(&self) -> Result<JsValue, JsValue>;
}

/// Key-dispatched prop update. The `match` arms are the only place the props
/// field names appear.
pub trait PropSink {
    fn set(&mut self, key: &str, value: JsValue) -> Result<(), JsValue>;
}

impl FromJs for i32 {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        value
            .as_f64()
            .map(|value| value as i32)
            .ok_or_else(|| JsValue::from_str("Vooya expected a number for i32"))
    }
}

impl FromJs for u32 {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        value
            .as_f64()
            .map(|value| value as u32)
            .ok_or_else(|| JsValue::from_str("Vooya expected a number for u32"))
    }
}

impl FromJs for i64 {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        value
            .as_f64()
            .map(|value| value as i64)
            .ok_or_else(|| JsValue::from_str("Vooya expected a number for i64"))
    }
}

impl FromJs for f64 {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        value
            .as_f64()
            .ok_or_else(|| JsValue::from_str("Vooya expected a number for f64"))
    }
}

impl FromJs for bool {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        value
            .as_bool()
            .ok_or_else(|| JsValue::from_str("Vooya expected a boolean"))
    }
}

impl FromJs for String {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        value
            .as_string()
            .ok_or_else(|| JsValue::from_str("Vooya expected a string"))
    }
}

impl ToJs for i32 {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_f64(*self as f64))
    }
}

impl ToJs for u32 {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_f64(*self as f64))
    }
}

impl ToJs for i64 {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_f64(*self as f64))
    }
}

impl ToJs for f64 {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_f64(*self))
    }
}

impl ToJs for bool {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_bool(*self))
    }
}

impl ToJs for String {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_str(self))
    }
}

impl<T: ToJs> ToJs for Vec<T> {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        let array = js_sys::Array::new();
        for value in self {
            array.push(&value.to_js()?);
        }
        Ok(array.into())
    }
}

impl<T: FromJs> FromJs for Vec<T> {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        let array: js_sys::Array = value
            .clone()
            .dyn_into()
            .map_err(|_| JsValue::from_str("Vooya expected an array"))?;
        let mut values = Vec::with_capacity(array.length() as usize);
        for index in 0..array.length() {
            values.push(T::from_js(&array.get(index))?);
        }
        Ok(values)
    }
}

/// A transport-agnostic typed event dispatcher.
///
/// DOM components wire this to dispatch a `vooya-` prefixed `CustomEvent` on
/// their host element. State stores wire it to invoke a JavaScript callback.
#[derive(Clone)]
pub struct EventSink(Rc<RefCell<dyn FnMut(&str, JsValue)>>);

impl EventSink {
    pub fn new<F>(dispatch: F) -> Self
    where
        F: FnMut(&str, JsValue) + 'static,
    {
        Self(Rc::new(RefCell::new(dispatch)))
    }

    pub fn dispatch(&self, name: &str, payload: JsValue) {
        (self.0.borrow_mut())(name, payload);
    }
}

/// Builds a sink that dispatches a `vooya-` prefixed, non-bubbling
/// `CustomEvent` on `host`, matching the current adapter transport.
pub fn dispatch_custom_event(host: Element) -> impl FnMut(&str, JsValue) {
    move |name, payload| {
        let init = CustomEventInit::new();
        init.set_bubbles(false);
        init.set_detail(&payload);
        if let Ok(event) = CustomEvent::new_with_event_init_dict(&format!("vooya-{name}"), &init) {
            let _ = host.dispatch_event(&event);
        }
    }
}

/// Builds a sink that forwards notifications to a JavaScript callback as
/// `callback(name, payload)`.
pub fn dispatch_notify(notify: js_sys::Function) -> impl FnMut(&str, JsValue) {
    move |name, payload| {
        let _ = notify.call2(
            &JsValue::UNDEFINED,
            &JsValue::from_str(name),
            &payload,
        );
    }
}

/// The host and owned props/events handed to a `#[voo::component]` function.
///
/// `events` is boxed so a `Context<Props, dyn Events>` written by the author
/// stays a sized value: the component macro constructs the concrete dispatcher
/// and coerces it to the trait object.
pub struct Context<P, E: ?Sized> {
    pub host: Element,
    pub props: P,
    pub events: Box<E>,
}

pub mod prelude {
    pub use crate::{
        Context, EventSink, FromJs, PropSink, ToJs, voo,
        dispatch_custom_event, dispatch_notify,
        effect, signal,
    };
    pub use vooya_core::{EventListener, MountCleanup, Signal, View, ViewElement};
    pub use vooya_macros::{FromJs, Props, ToJs, component, events, store};
}

/// Attribute-macro namespace so components can write `#[voo::events]`,
/// `#[voo::component]`, and `#[voo::store]` as in the RFCs.
pub mod voo {
    pub use vooya_macros::{Props, FromJs, ToJs, component, events, store};
}

mod store;
pub use store::StoreRuntime;
