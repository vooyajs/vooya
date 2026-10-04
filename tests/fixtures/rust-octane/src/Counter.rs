use wasm_bindgen::JsValue;
use vooya as voo;
use voo::ToJs;

#[derive(voo::FromJs, voo::ToJs)]
pub struct Selection {
    pub id: u32,
    pub tags: Vec<String>,
}

#[voo::props]
#[derive(voo::FromJs)]
pub struct CounterProps {
    pub count: u32,
    pub selection: Selection,
}

#[voo::events]
pub trait CounterEvents {
    fn selected(value: Selection);
}

#[voo::component]
#[voo::style("./Counter.css", scoped)]
pub fn Counter(
    view: &voo::View,
    props: CounterProps,
) -> Result<voo::ViewElement, JsValue> {
    let label = format!("Count: {}", props.count);
    let root = voo::rsx!(view, <button>{label}</button>)?;
    view.emit("selected", props.selection.to_js()?)?;
    Ok(root)
}
