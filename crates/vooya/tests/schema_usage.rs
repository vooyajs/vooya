use vooya as voo;
use std::collections::BTreeMap;

#[derive(voo::FromJs, voo::ToJs, PartialEq, Clone)]
struct AbiV1Values {
    small: u32,
    precise: u128,
    optional: Option<String>,
    pair: (u32, Option<String>),
    values: Vec<u32>,
    labels: BTreeMap<String, u64>,
}

#[derive(voo::FromJs, voo::ToJs)]
pub struct CartLine {
    pub sku: String,
    pub quantity: u32,
}

#[derive(voo::FromJs, voo::ToJs)]
pub enum CartStatus {
    Open,
    CheckedOut,
}

#[voo::props(id = "schema_usage::CartProps")]
#[derive(voo::FromJs, voo::ToJs, PartialEq, Clone)]
pub struct CartProps {
    pub initial_items: u32,
    pub coupon: Option<String>,
}

#[voo::events(id = "schema_usage::CartEvents")]
pub trait CartEvents {
    fn checked_out(order_id: u64);
}

#[derive(Default)]
pub struct Cart;

#[voo::store(id = "schema_usage::Cart")]
impl Cart {
    #[voo::action]
    pub fn add(&mut self, quantity: u32) {
        let _ = quantity;
    }

    #[voo::action]
    pub fn checked_add(
        &mut self,
        quantity: u32,
    ) -> Result<(), voo::__private::wasm_bindgen::JsValue> {
        let _ = quantity;
        Ok(())
    }

    #[voo::snapshot]
    pub fn snapshot(&self) -> CartProps {
        CartProps {
            initial_items: 0,
            coupon: None,
        }
    }
}

#[allow(non_snake_case)]
#[voo::component(id = "schema_usage::CartPanel")]
pub fn CartPanel(
    view: &voo::View,
    props: CartProps,
) -> Result<voo::ViewElement, voo::__private::wasm_bindgen::JsValue> {
    let _ = props;
    view.element("div")
}

#[test]
fn role_macros_compile_for_public_roots() {
    let _ = core::any::TypeId::of::<AbiV1Values>();
    let mut cart = Cart;
    cart.add(1);
    cart.checked_add(1).unwrap();
    assert_eq!(cart.snapshot().initial_items, 0);
}

#[allow(dead_code)]
fn rsx_tree_compiles(
    view: &voo::View,
    count: u32,
) -> Result<voo::ViewElement, voo::__private::wasm_bindgen::JsValue> {
    voo::rsx!(view,
        <section class="cart">
            <h1>"Cart"</h1>
            <span>{count}</span>
        </section>
    )
}
