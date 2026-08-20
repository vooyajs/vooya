//! Emission of `__voo_schema` link-section records.
//!
//! Every Vooya macro that contributes a public ABI surface (props, events,
//! components, stores, and user types) writes one compact JSON record into the
//! `__voo_schema` custom section of the produced wasm module. The bundler build
//! layer reads that section and generates the framework-facing surface
//! (TypeScript declarations, adapter definitions, hooks/composables) without a
//! separate Rust-side schema file.
//!
//! The records are emitted as `#[used]` byte-array statics so the linker keeps
//! the section alive. Records are single-line JSON; the build layer splits on
//! newlines.

use proc_macro2::{Ident, Literal, TokenStream};
use quote::quote;

/// Identifier used to derive a unique static name for a schema record.
pub fn schema_id(kind: &str, name: &str) -> Ident {
    let mut digest = 0xcbf29ce484222325_u64;
    for byte in format!("{kind}:{name}").bytes() {
        digest ^= u64::from(byte);
        digest = digest.wrapping_mul(0x100000001b3);
    }
    Ident::new(
        &format!("__VOO_SCHEMA_{kind}_{name}_{digest:016x}"),
        proc_macro2::Span::call_site(),
    )
}

/// Emits one `#[used]` static holding `json` bytes in the `__voo_schema`
/// custom section. `json` must not contain a literal newline.
pub fn emit_schema(kind: &str, name: &str, json: &str) -> TokenStream {
    let id = schema_id(kind, name);
    let json = format!("{json}\n");
    let bytes = Literal::byte_string(json.as_bytes());
    let len = json.len();
    quote! {
        #[used]
        #[unsafe(link_section = "__voo_schema")]
        #[doc(hidden)]
        static #id: [u8; #len] = *#bytes;
    }
}

/// Emits the identifier for a single JSON string token (safe for JSON because
/// identifiers only contain letters, digits and underscores).
pub fn json_string(value: &str) -> String {
    format!("{value:?}")
}

/// Builds a JSON field descriptor.
pub fn field(name: &str, ty: &str) -> String {
    format!(
        r#"{{"name":{},"type":{}}}"#,
        json_string(name),
        json_string(ty)
    )
}

/// The wire key for a Rust field: the JavaScript side is camelCase, so
/// `total_cents` crosses the boundary as `totalCents`.
pub fn wire_key(name: &str) -> String {
    let mut parts = name.split(|character| character == '_' || character == '-');
    let mut result = String::new();
    if let Some(first) = parts.next() {
        result.push_str(first);
    }
    for part in parts {
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            result.push(first.to_ascii_uppercase());
            result.extend(chars);
        }
    }
    result
}
