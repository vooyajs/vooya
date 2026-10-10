use vooya as voo;

#[voo::component]
pub fn Counter(view: &voo::View) -> Result<voo::ViewElement, wasm_bindgen::JsValue> {
    voo::rsx!(view, <output>"Turbopack probe"</output>)
}
