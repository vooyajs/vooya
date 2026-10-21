// The component contract and implementation are ordinary Rust.
#[vooya::props]
#[derive(vooya::FromJs)]
pub struct PortableCounterProps {
    pub initial: i32,
}

use crate::{View, ViewElement};
use wasm_bindgen::JsValue;

pub struct Component {
    root: ViewElement,
}

impl Component {
    pub fn update_initial(&self, initial: i32) {
        self.root.set_text(&initial.to_string());
    }
    pub fn dispose(&mut self) {
        self.root.remove();
    }
}

fn mount(context: MountContext) -> Result<Component, JsValue> {
    let host = context.host;
    let view = View::from_host(&host)?;
    let root = view
        .element("output")?
        .class("vooya-portable-counter")
        .text(&context.props.initial.to_string());
    root.mount(&host)?;
    Ok(Component { root })
}

struct MountProps {
    initial: i32,
}

struct MountContext {
    host: web_sys::Element,
    props: MountProps,
}

thread_local! {
    static MOUNTED: std::cell::RefCell<Vec<Option<Component>>> = const { std::cell::RefCell::new(Vec::new()) };
}

#[vooya::component(update = "update_portable_counter")]
#[vooya::style("./PortableCounter.css", scoped)]
pub fn PortableCounter(
    view: &vooya::View,
    props: PortableCounterProps,
) -> Result<vooya::ViewElement, wasm_bindgen::JsValue> {
    let root = view
        .element("div")?
        .attribute("style", "display: contents")?;
    let cleanup = vooya::MountCleanup::default();
    let context = MountContext {
        host: root.as_element().clone(),
        props: MountProps {
            initial: props.initial,
        },
    };
    let component = match mount(context) {
        Ok(component) => component,
        Err(cause) => {
            cleanup.run();
            root.remove();
            return Err(cause);
        }
    };
    cleanup.disarm();
    let handle = MOUNTED.with(|mounted| {
        let mut mounted = mounted.borrow_mut();
        if let Some(handle) = mounted.iter().position(Option::is_none) {
            mounted[handle] = Some(component);
            handle
        } else {
            mounted.push(Some(component));
            mounted.len() - 1
        }
    });
    root.as_element()
        .set_attribute("data-example-handle", &handle.to_string())?;
    root.defer_cleanup(move || {
        let component =
            MOUNTED.with(|mounted| mounted.borrow_mut().get_mut(handle).and_then(Option::take));
        if let Some(mut component) = component {
            component.dispose();
        }
    });
    Ok(root)
}

fn update_portable_counter(
    root: &vooya::ViewElement,
    props: PortableCounterProps,
) -> Result<(), wasm_bindgen::JsValue> {
    let handle = root
        .as_element()
        .get_attribute("data-example-handle")
        .and_then(|value| value.parse::<usize>().ok())
        .ok_or_else(|| wasm_bindgen::JsValue::from_str("missing example instance"))?;
    MOUNTED.with(|mounted| {
        let mounted = mounted.borrow();
        let component = mounted
            .get(handle)
            .and_then(Option::as_ref)
            .ok_or_else(|| wasm_bindgen::JsValue::from_str("disposed example instance"))?;
        component.update_initial(props.initial);
        Ok(())
    })
}
