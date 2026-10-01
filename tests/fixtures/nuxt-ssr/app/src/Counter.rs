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
    root.defer_cleanup(|| record_disposal("__vooyaComponentDisposals"));
    Ok(root)
}

fn record_disposal(name: &str) {
    let global = js_sys::global();
    let key = wasm_bindgen::JsValue::from_str(name);
    let count = js_sys::Reflect::get(&global, &key).ok().and_then(|value| value.as_f64()).unwrap_or(0.0);
    js_sys::Reflect::set(&global, &key, &wasm_bindgen::JsValue::from_f64(count + 1.0)).unwrap();
}
