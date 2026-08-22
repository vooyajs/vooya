use wasm_bindgen::JsValue;
use vooya as voo;

#[voo::props]
#[derive(voo::FromJs)]
pub struct CounterProps {
    pub count: u32,
}

#[voo::events]
pub trait CounterEvents {
    fn selected(value: u32);
}

#[voo::component]
#[voo::style("./Counter.css", scoped)]
pub fn Counter(
    view: &voo::View,
    props: CounterProps,
) -> Result<voo::ViewElement, JsValue> {
    let label = format!("Count: {}", props.count);
    let root = voo::rsx!(view, <button class="counter">{label}</button>)?;
    view.emit("selected", JsValue::from_f64(props.count as f64))?;
    Ok(root)
}
