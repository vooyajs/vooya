use std::collections::BTreeMap;

use wasm_bindgen::JsValue;
use vooya as voo;
use voo::ToJs;

#[voo::props]
#[derive(voo::FromJs)]
pub struct AbiProps {
    pub small: u32,
    pub precise: u128,
    pub optional: Option<String>,
    pub pair: (u32, Option<String>),
    pub labels: BTreeMap<String, u64>,
}

#[voo::events]
pub trait AbiEvents {
    fn payload(value: u128);
}

#[voo::component]
pub fn Abi(
    view: &voo::View,
    props: AbiProps,
) -> Result<voo::ViewElement, JsValue> {
    let optional = props.optional.as_deref().unwrap_or("none");
    let label = format!(
        "ABI {} {} {} {} {}",
        props.small,
        props.precise,
        optional,
        props.pair.0,
        props.labels.len(),
    );
    let root = voo::rsx!(view, <button class="abi-probe">{label}</button>)?;
    view.emit("payload", props.precise.to_js()?)?;
    Ok(root)
}
