#![cfg(target_arch = "wasm32")]

use vooya::{View, signal, rsx};
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

#[wasm_bindgen_test]
fn rsx_signal_text_updates_and_cleans_up() -> Result<(), wasm_bindgen::JsValue> {
    let document = web_sys::window().unwrap().document().unwrap();
    let host = document.create_element("div").unwrap();
    let view = View::from_host(&host).unwrap();
    let count = signal(1u32);
    let tree = rsx!(view, <span data_count={count.get()}>{count.get()}</span>).unwrap();
    tree.mount(&host).unwrap();
    assert_eq!(tree.as_element().text_content().as_deref(), Some("1"));
    assert_eq!(tree.as_element().get_attribute("data_count").as_deref(), Some("1"));

    count.set(2);
    assert_eq!(tree.as_element().text_content().as_deref(), Some("2"));
    assert_eq!(tree.as_element().get_attribute("data_count").as_deref(), Some("2"));

    tree.remove();
    count.set(3);
    assert_eq!(tree.as_element().text_content().as_deref(), Some("2"));
    assert_eq!(tree.as_element().get_attribute("data_count").as_deref(), Some("2"));
    Ok(())
}
