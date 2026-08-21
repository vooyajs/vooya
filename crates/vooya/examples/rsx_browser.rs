use vooya::{View, rsx};
use wasm_bindgen::prelude::*;

/// The smallest runnable DOM-only RSX component. Host adapters call this kind
/// of export; this example keeps the host boundary explicit for browser proof.
#[wasm_bindgen]
pub fn mount_rsx(host: web_sys::Element) -> Result<(), JsValue> {
    let view = View::from_host(&host)?;
    let root = rsx!(view,
        <section class="cart">
            <h1>"Cart"</h1>
            <span>{3}</span>
        </section>
    )?;
    root.mount(&host)
}
