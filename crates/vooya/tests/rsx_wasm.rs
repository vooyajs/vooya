#![cfg(target_arch = "wasm32")]

use vooya::{View, rsx};
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn rsx_creates_a_nested_dom_tree() -> Result<(), wasm_bindgen::JsValue> {
    let document = web_sys::window().unwrap().document().unwrap();
    let host = document.create_element("div").unwrap();
    let view = View::from_host(&host).unwrap();
    let tree = rsx!(view,
        <section class="cart">
            <h1>"Cart"</h1>
            <span>{3}</span>
        </section>
    )
    .unwrap();

    assert_eq!(tree.as_element().tag_name(), "SECTION");
    assert_eq!(
        tree.as_element().get_attribute("class").as_deref(),
        Some("cart")
    );
    assert_eq!(tree.as_element().children().length(), 2);
    assert_eq!(
        tree.as_element()
            .children()
            .item(0)
            .unwrap()
            .text_content()
            .as_deref(),
        Some("Cart")
    );
    assert_eq!(
        tree.as_element()
            .children()
            .item(1)
            .unwrap()
            .text_content()
            .as_deref(),
        Some("3")
    );
    Ok(())
}
