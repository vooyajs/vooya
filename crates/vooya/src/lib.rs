//! The public Rust authoring surface for Vooya.
//!
//! Framework roles are attributes (`#[voo::component]`, `#[voo::store]` and
//! related markers). Data conversion capabilities are provided by derives in a
//! later ABI layer; this crate deliberately keeps those concerns separate.

pub use vooya_core::*;
pub use vooya_macros::{action, component, events, props, snapshot, store};
