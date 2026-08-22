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
    let tree = rsx!(view, <span data-count={count.get()}>{count.get()}</span>).unwrap();
    tree.mount(&host).unwrap();
    assert_eq!(tree.as_element().text_content().as_deref(), Some("1"));
    assert_eq!(tree.as_element().get_attribute("data-count").as_deref(), Some("1"));

    count.set(2);
    assert_eq!(tree.as_element().text_content().as_deref(), Some("2"));
    assert_eq!(tree.as_element().get_attribute("data-count").as_deref(), Some("2"));

    tree.remove();
    count.set(3);
    assert_eq!(tree.as_element().text_content().as_deref(), Some("2"));
    assert_eq!(tree.as_element().get_attribute("data-count").as_deref(), Some("2"));
    Ok(())
}

#[wasm_bindgen_test]
fn rsx_event_bindings_are_owned_by_the_root() -> Result<(), wasm_bindgen::JsValue> {
    let document = web_sys::window().unwrap().document().unwrap();
    let host = document.create_element("div").unwrap();
    let view = View::from_host(&host).unwrap();
    let count = signal(0u32);
    let next = count.clone();
    let tree = rsx!(view,
        <button on-click={move |_| next.set(1)} >"Click"</button>
    )
    .unwrap();
    tree.mount(&host).unwrap();

    let event = web_sys::Event::new("click")?;
    tree.as_element().dispatch_event(&event)?;
    assert_eq!(count.get(), 1);

    tree.remove();
    let event = web_sys::Event::new("click")?;
    tree.as_element().dispatch_event(&event)?;
    assert_eq!(count.get(), 1);
    Ok(())
}

#[wasm_bindgen_test]
fn owned_children_can_be_reordered_and_replaced() -> Result<(), wasm_bindgen::JsValue> {
    let document = web_sys::window().unwrap().document().unwrap();
    let host = document.create_element("div").unwrap();
    let view = View::from_host(&host).unwrap();
    let root = rsx!(view, <div></div>)?;
    let first = rsx!(view, <span>"first"</span>)?;
    let second = rsx!(view, <span>"second"</span>)?;
    root.append(&first)?;
    root.append(&second)?;
    root.insert_before(&second, Some(&first))?;
    assert_eq!(root.as_element().text_content().as_deref(), Some("secondfirst"));

    let replacement = rsx!(view, <span>"replacement"</span>)?;
    root.replace_child(&second, Some(&replacement))?;
    assert_eq!(
        root.as_element().text_content().as_deref(),
        Some("firstreplacement")
    );
    root.remove();
    Ok(())
}
