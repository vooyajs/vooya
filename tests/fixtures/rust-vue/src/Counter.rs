use wasm_bindgen::JsValue;
use vooya as voo;

#[voo::props]
#[derive(voo::FromJs)]
pub struct CounterProps {
    pub count: u32,
}

#[voo::component]
#[voo::style("./Counter.css", scoped)]
pub fn Counter(
    view: &voo::View,
    props: CounterProps,
) -> Result<voo::ViewElement, JsValue> {
    let label = format!("Count: {}", props.count);
    voo::rsx!(view, <button class="counter">{label}</button>)
}
