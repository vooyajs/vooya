use vooya as voo;
use wasm_bindgen::JsValue;

#[derive(voo::ToJs, PartialEq, Clone)]
pub struct CartTotals {
    pub item_count: u32,
    pub labels: Vec<String>,
}

#[derive(voo::ToJs, PartialEq, Clone)]
pub struct CartSnapshot {
    pub count: u32,
    pub totals: CartTotals,
    pub last_label: Option<String>,
    pub range: (u32, String),
}

#[derive(Default)]
pub struct Cart {
    count: u32,
}

#[voo::store]
impl Cart {
    #[voo::action]
    pub fn add(&mut self, amount: u32) {
        self.count += amount;
    }

    #[voo::action]
    pub fn checked_add(&mut self, amount: u32, fail: bool) -> std::result::Result<(), JsValue> {
        self.count += amount;
        if fail { Err(JsValue::from_str("std action failed")) } else { Ok(()) }
    }

    #[voo::action]
    pub fn checked_core(&mut self, amount: u32) -> ::core::result::Result<(), JsValue> {
        self.count += amount;
        Err(JsValue::from_str("core action failed"))
    }

    #[voo::action]
    pub fn checked_plain(&mut self, amount: u32) -> Result<(), JsValue> {
        self.count += amount;
        Err(JsValue::from_str("plain action failed"))
    }

    #[voo::snapshot]
    pub fn snapshot(&self) -> CartSnapshot {
        CartSnapshot {
            count: self.count,
            totals: CartTotals { item_count: self.count, labels: vec!["cart".to_owned()] },
            last_label: Some("cart".to_owned()),
            range: (0, "cart".to_owned()),
        }
    }
}
