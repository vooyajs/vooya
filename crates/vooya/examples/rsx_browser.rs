use vooya::{View, ViewElement, rsx};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct RsxMount {
    root: ViewElement,
}

#[wasm_bindgen]
impl RsxMount {
    pub fn dispose(&self) {
        self.root.remove();
    }
}

/// The smallest runnable DOM-only RSX component. Host adapters call this kind
/// of export; this example keeps the host boundary explicit for browser proof.
#[wasm_bindgen]
pub fn mount_rsx(host: web_sys::Element) -> Result<RsxMount, JsValue> {
    let view = View::from_host(&host)?;
    let root = rsx!(view,
        <section class="cart">
            <h1>"Cart"</h1>
            <span>{3}</span>
        </section>
    )?;
    root.mount(&host)?;
    Ok(RsxMount { root })
}
