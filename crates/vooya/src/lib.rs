//! The public Rust authoring surface for Vooya.
//!
//! Framework roles are attributes (`#[voo::component]`, `#[voo::store]` and
//! related markers). Data conversion capabilities are provided by derives in a
//! later ABI layer; this crate deliberately keeps those concerns separate.

mod abi;
mod store;

pub use abi::{FromJs, ToJs, abi_error};
pub use store::{DomainSubscription, Store, StoreState, Subscription};
pub use vooya_core::*;
pub use vooya_macros::{FromJs, ToJs, action, component, events, props, snapshot, store};

/// Implementation dependencies made available to generated derives without
/// requiring application crates to depend on them directly.
#[doc(hidden)]
pub mod __private {
    pub use js_sys;
    pub use wasm_bindgen;
}
