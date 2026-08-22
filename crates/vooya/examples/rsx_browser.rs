use vooya::{Signal, View, ViewElement, rsx, signal};
use wasm_bindgen::prelude::*;

#[derive(Clone)]
struct Row {
    id: u32,
    label: &'static str,
}

#[wasm_bindgen]
pub struct RsxMount {
    root: ViewElement,
    visible: Signal<bool>,
    rows: Signal<Vec<Row>>,
}

#[wasm_bindgen]
impl RsxMount {
    pub fn dispose(&self) {
        self.root.remove();
    }

    pub fn toggle(&self) {
        self.visible.update(|visible| *visible = !*visible);
    }

    pub fn reorder(&self) {
        self.rows.set(vec![
            Row { id: 2, label: "Second" },
            Row { id: 1, label: "First" },
            Row { id: 3, label: "Third" },
        ]);
    }
}

/// The smallest runnable DOM-only RSX component. Host adapters call this kind
/// of export; this example keeps the host boundary explicit for browser proof.
#[wasm_bindgen]
pub fn mount_rsx(host: web_sys::Element) -> Result<RsxMount, JsValue> {
    let view = View::from_host(&host)?;
    let visible = signal(true);
    let rows = signal(vec![
        Row { id: 1, label: "First" },
        Row { id: 2, label: "Second" },
    ]);
    let visible_for_view = visible.clone();
    let rows_for_view = rows.clone();
    let root = rsx!(view,
        <section class="cart">
            <h1>"Cart"</h1>
            if visible_for_view.get() {
                <p class="branch">"Shown"</p>
            } else {
                <p class="branch">"Hidden"</p>
            }
            <ul class="rows">
                for item in rows_for_view.get() {
                    <li key={item.id} data-id={item.id}>{item.label}</li>
                }
            </ul>
        </section>
    )?;
    root.mount(&host)?;
    Ok(RsxMount { root, visible, rows })
}
