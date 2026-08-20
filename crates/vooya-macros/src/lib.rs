//! Procedural macros for Vooya Rust-file components and state stores.
//!
//! These macros implement the authoring surface described by the Vooya RFCs:
//! a component is a plain Rust file. Props, events, and structured user types
//! are declared in Rust; each macro emits a record into the `__voo_schema`
//! wasm custom section that the bundler build layer reads to generate the
//! framework-facing surface.

mod component;
mod events;
mod js;
mod props;
mod schema;
mod store;

use proc_macro::TokenStream;

/// `#[derive(Props)]`: props decoded whole from the host at mount plus a
/// key-dispatched `PropSink` for prop updates.
#[proc_macro_derive(Props)]
pub fn derive_props(input: TokenStream) -> TokenStream {
    match js::parse_derive(input) {
        Ok(input) => props::derive_props(&input).into(),
        Err(error) => error.to_compile_error().into(),
    }
}

/// `#[derive(FromJs)]`: JSON-compatible decode of a Rust type from `JsValue`.
#[proc_macro_derive(FromJs)]
pub fn derive_from_js(input: TokenStream) -> TokenStream {
    match js::parse_derive(input) {
        Ok(input) => js::derive_from_js(&input).into(),
        Err(error) => error.to_compile_error().into(),
    }
}

/// `#[derive(ToJs)]`: JSON-compatible encode of a Rust type to `JsValue`.
#[proc_macro_derive(ToJs)]
pub fn derive_to_js(input: TokenStream) -> TokenStream {
    match js::parse_derive(input) {
        Ok(input) => js::derive_to_js(&input).into(),
        Err(error) => error.to_compile_error().into(),
    }
}

/// `#[voo::events]`: a trait whose methods become typed component events.
#[proc_macro_attribute]
pub fn events(args: TokenStream, input: TokenStream) -> TokenStream {
    events::expand_events(args.into(), input.into()).into()
}

/// `#[voo::component]`: a function that builds a Rust-owned DOM component.
#[proc_macro_attribute]
pub fn component(args: TokenStream, input: TokenStream) -> TokenStream {
    component::expand_component(args.into(), input.into()).into()
}

/// `#[voo::store]`: an `impl` block holding Rust-owned state and logic.
#[proc_macro_attribute]
pub fn store(args: TokenStream, input: TokenStream) -> TokenStream {
    store::expand_store(args.into(), input.into()).into()
}
