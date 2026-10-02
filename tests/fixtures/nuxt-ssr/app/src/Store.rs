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

impl Drop for Cart {
    fn drop(&mut self) { record_disposal("__vooyaStoreDisposals"); }
}

fn record_disposal(name: &str) {
    let global = js_sys::global();
    let key = wasm_bindgen::JsValue::from_str(name);
    let count = js_sys::Reflect::get(&global, &key).ok().and_then(|value| value.as_f64()).unwrap_or(0.0);
    js_sys::Reflect::set(&global, &key, &wasm_bindgen::JsValue::from_f64(count + 1.0)).unwrap();
}
