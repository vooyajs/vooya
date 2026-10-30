use vooya as voo;

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
    pub fn add_total(&mut self, amount: u32) -> u32 {
        self.count += amount;
        self.count
    }

    #[voo::action]
    pub fn receipt(&mut self, amount: u32, fail: bool) -> Result<CartTotals, wasm_bindgen::JsValue> {
        self.count += amount;
        if fail { return Err(wasm_bindgen::JsValue::from_str("receipt failed")); }
        Ok(CartTotals { item_count: self.count, labels: vec!["receipt".into()] })
    }

    #[voo::action]
    pub fn precise(&mut self) -> u64 { 9007199254740993 }

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
