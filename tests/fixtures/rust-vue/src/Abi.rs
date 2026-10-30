use std::collections::BTreeMap;

use wasm_bindgen::JsValue;
use vooya as voo;
use voo::ToJs;

type Count = u32;
type Precise = u128;
type MaybeLabel = Option<String>;
type Pair = (u32, Option<String>);
type Labels = BTreeMap<String, u64>;

#[voo::props]
#[derive(voo::FromJs)]
pub struct AbiProps {
    pub small: Count,
    pub precise: Precise,
    pub optional: MaybeLabel,
    pub pair: Pair,
    pub labels: Labels,
}

#[voo::events]
pub trait AbiEvents {
    fn payload(value: Precise);
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
