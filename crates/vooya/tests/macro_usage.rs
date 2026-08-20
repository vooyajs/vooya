//! Compile-time and behavior coverage for the macro-generated surfaces.
//!
//! The struct, trait, component, and store definitions below exercise every
//! Vooya macro as an application author would: expansion must type-check on
//! the host. Behavior that requires a JavaScript engine (property reflection,
//! `JsValue` encoding, wasm-bindgen exports) lives in the `wasm_only` module
//! and runs under `wasm-bindgen-test`; the pure state-store rules are covered
//! by the unit tests in `vooya::store`.

use vooya::prelude::*;

// ---------------------------------------------------------------------------
// DOM component surface (RFC #60)
// ---------------------------------------------------------------------------

#[derive(Props, Clone)]
pub struct GreetingProps {
    pub name: String,
    pub times: u32,
}

#[derive(FromJs, ToJs, Clone, Debug, PartialEq)]
pub struct Bounds {
    pub min: i32,
    pub max: i32,
}

#[derive(FromJs, ToJs, Clone, Debug, PartialEq)]
pub enum Limit {
    Reached,
    Rejected(String),
}

#[voo::events]
pub trait GreetingEvents {
    fn change(&self, value: i32);
    fn limit(&self, state: Limit);
}

#[allow(non_snake_case)]
#[voo::component]
pub fn Greeting(
    _ctx: Context<GreetingProps, dyn GreetingEvents>,
) -> Result<ViewElement, wasm_bindgen::JsValue> {
    unreachable!("mount is exercised on the wasm target")
}

// ---------------------------------------------------------------------------
// State store surface (RFC #61)
// ---------------------------------------------------------------------------

#[derive(Props, Clone)]
pub struct CartProps {
    pub tax_rate: f64,
}

#[voo::events]
pub trait CartEvents {
    fn coupon_rejected(&self, reason: String);
}

#[derive(ToJs, PartialEq, Clone, Debug)]
pub struct LineItem {
    pub sku: String,
    pub qty: u32,
}

#[derive(ToJs, PartialEq, Clone, Debug)]
pub struct CartView {
    pub items: Vec<LineItem>,
    pub total_cents: i64,
}

#[derive(ToJs, PartialEq, Clone, Debug)]
pub struct Discount {
    pub percent: u32,
}

impl Discount {
    fn new(percent: u32) -> Self {
        Self { percent }
    }
}

#[allow(dead_code)]
struct Cart {
    items: Vec<LineItem>,
    tax_rate: f64,
}

#[voo::store]
impl Cart {
    fn new(props: &CartProps) -> Self {
        Self {
            items: Vec::new(),
            tax_rate: props.tax_rate,
        }
    }

    #[voo::snapshot]
    fn snapshot(&self) -> CartView {
        CartView {
            items: self.items.clone(),
            total_cents: self.total_cents(),
        }
    }

    #[voo::action]
    pub fn add(&mut self, sku: String, qty: u32) -> Result<(), wasm_bindgen::JsValue> {
        self.items.push(LineItem { sku, qty });
        Ok(())
    }

    #[voo::action]
    pub fn apply_coupon(
        &mut self,
        events: &dyn CartEvents,
        props: &CartProps,
        code: String,
    ) -> Result<Discount, wasm_bindgen::JsValue> {
        let _ = (events, props);
        if code.is_empty() {
            return Err(wasm_bindgen::JsValue::from_str("coupon required"));
        }
        self.items.push(LineItem { sku: code, qty: 0 });
        Ok(Discount::new(10))
    }

    fn total_cents(&self) -> i64 {
        self.items.iter().map(|item| i64::from(item.qty) * 100).sum()
    }
}

// ---------------------------------------------------------------------------
// Behavior coverage for the wasm target. `wasm-bindgen-test` provides the
// JavaScript engine that the ABI layer requires.
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
mod wasm_only {
    use super::*;
    use vooya::StoreRuntime;
    use vooya::{FromJs, PropSink};

    #[test]
    fn props_decode_and_key_dispatch() {
        let object = js_sys::Object::new();
        js_sys::Reflect::set(&object, &"name".into(), &"Vooya".into()).unwrap();
        js_sys::Reflect::set(&object, &"times".into(), &3.into()).unwrap();

        let mut props = <GreetingProps as FromJs>::from_js(&object.into()).unwrap();
        assert_eq!(props.name, "Vooya");
        assert_eq!(props.times, 3);

        <GreetingProps as PropSink>::set(&mut props, "times", 5.into()).unwrap();
        assert_eq!(props.times, 5);

        assert!(
            <GreetingProps as PropSink>::set(&mut props, "missing", wasm_bindgen::JsValue::UNDEFINED)
                .is_err(),
            "unknown keys are rejected"
        );
    }

    #[test]
    fn structured_types_cross_the_boundary() {
        let bounds = Bounds { min: -5, max: 10 };
        let decoded = <Bounds as FromJs>::from_js(&bounds.to_js().unwrap()).unwrap();
        assert_eq!(bounds, decoded);

        let rejected = Limit::Rejected("expired".into());
        let decoded = <Limit as FromJs>::from_js(&rejected.to_js().unwrap()).unwrap();
        assert_eq!(rejected, decoded);
    }

    #[test]
    fn events_dispatcher_forwards_payloads() {
        let seen = std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
        let inner = seen.clone();
        let dispatcher = GreetingEventsImpl::new(EventSink::new(move |name, payload| {
            inner.borrow_mut().push((name.to_owned(), payload.as_f64()));
        }));

        dispatcher.change(7);
        dispatcher.limit(Limit::Reached);

        let seen = seen.borrow();
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0].0, "change");
        assert_eq!(seen[0].1, Some(7.0));
        assert_eq!(seen[1].0, "limit");
        assert_eq!(seen[1].1, None, "a unit event carries no scalar payload");
    }

    #[test]
    fn store_dispatch_and_snapshot() {
        use wasm_bindgen::JsCast;

        let runtime = StoreRuntime::<Cart, CartProps, CartView>::new(
            Cart::new(&CartProps { tax_rate: 0.08 }),
            CartProps { tax_rate: 0.08 },
            EventSink::new(|_, _| {}),
            std::rc::Rc::new(|cart| cart.snapshot()),
        );

        let notified = std::rc::Rc::new(std::cell::Cell::new(0));
        let inner = notified.clone();
        let closure = wasm_bindgen::closure::Closure::wrap(Box::new(move || {
            inner.set(inner.get() + 1);
        }) as Box<dyn Fn()>);
        let callback = closure.as_ref().unchecked_ref::<js_sys::Function>().clone();
        let subscription = runtime.subscribe(callback);

        let snapshot_before = runtime.snapshot_js();
        let _ = runtime.dispatch(|cart| cart.add("SKU-1".into(), 2));
        let snapshot_after = runtime.snapshot_js();
        assert_ne!(snapshot_before, snapshot_after);
        assert_eq!(notified.get(), 1);

        let _ = runtime.dispatch(|cart| cart.add("SKU-1".into(), 1));
        let _ = runtime.dispatch(|cart| cart.add("SKU-2".into(), 1));
        assert_eq!(notified.get(), 3);

        runtime.unsubscribe(subscription);
        let _ = runtime.dispatch(|cart| cart.add("SKU-3".into(), 1));
        assert_eq!(notified.get(), 3, "unsubscribed consumers stop receiving");
    }
}
