// A state component (RFC #61): Rust owns the cart logic and state, Vue owns
// the template. The generated `useCart` composable exposes the typed
// snapshot, actions, and notifications.
use vooya::prelude::*;

#[derive(Props, Clone)]
pub struct CartProps {
    pub tax_rate: f64,
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

#[voo::events]
pub trait CartEvents {
    fn coupon_rejected(&self, reason: String);
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
            total_cents: self
                .items
                .iter()
                .map(|item| i64::from(item.qty) * 100)
                .sum(),
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
    ) -> Result<(), wasm_bindgen::JsValue> {
        if code != "VOOYA10" {
            events.coupon_rejected(format!("{code} is not a valid coupon"));
            return Err(wasm_bindgen::JsValue::from_str("invalid coupon"));
        }
        let _ = props;
        Ok(())
    }
}

struct Cart {
    items: Vec<LineItem>,
    tax_rate: f64,
}
