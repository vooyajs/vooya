use vooya as voo;
use wasm_bindgen::JsValue;

#[voo::props]
#[derive(voo::FromJs)]
pub struct NestedProofProps {
    pub label: String,
}

#[voo::component]
pub fn NestedProof(
    view: &voo::View,
    props: NestedProofProps,
) -> Result<voo::ViewElement, JsValue> {
    Ok(view
        .element("p")?
        .attribute("data-nested-proof", "")?
        .text(&props.label))
}
