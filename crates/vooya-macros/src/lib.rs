//! Authoring macros which emit versioned, build-time Vooya schema records.

use proc_macro::TokenStream;
use quote::{format_ident, quote};
use serde_json::{Value, json};
use syn::{
    Attribute, Expr, FnArg, ImplItem, ItemFn, ItemImpl, ItemStruct, ItemTrait, Lit, MetaNameValue,
    Pat, TraitItem, Type, parse_macro_input,
};

const SCHEMA_VERSION: u32 = 1;

#[proc_macro_attribute]
pub fn props(attribute: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemStruct);
    let name = item.ident.to_string();
    let id = match schema_id(attribute, &name) {
        Ok(id) => id,
        Err(error) => return error.into_compile_error().into(),
    };
    let fields = item
        .fields
        .iter()
        .filter_map(|field| {
            field.ident.as_ref().map(|ident| {
                json!({
                    "name": ident.to_string(),
                    "type": type_name(&field.ty),
                })
            })
        })
        .collect::<Vec<_>>();
    let record = json!({
        "version": SCHEMA_VERSION,
        "kind": "props",
        "id": id,
        "name": item.ident.to_string(),
        "fields": fields,
    });
    emit_schema(item, record, "props")
}

#[proc_macro_attribute]
pub fn events(attribute: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemTrait);
    let name = item.ident.to_string();
    let id = match schema_id(attribute, &name) {
        Ok(id) => id,
        Err(error) => return error.into_compile_error().into(),
    };
    let methods = item
        .items
        .iter()
        .filter_map(|member| match member {
            TraitItem::Fn(method) => Some(json!({
                "name": method.sig.ident.to_string(),
                "params": parameters(&method.sig.inputs),
            })),
            _ => None,
        })
        .collect::<Vec<_>>();
    let record = json!({
        "version": SCHEMA_VERSION,
        "kind": "events",
        "id": id,
        "name": item.ident.to_string(),
        "methods": methods,
    });
    emit_schema(item, record, "events")
}

#[proc_macro_attribute]
pub fn component(attribute: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemFn);
    let name = item.sig.ident.to_string();
    let id = match schema_id(attribute, &name) {
        Ok(id) => id,
        Err(error) => return error.into_compile_error().into(),
    };
    let record = json!({
        "version": SCHEMA_VERSION,
        "kind": "component",
        "id": id,
        "name": item.sig.ident.to_string(),
        "params": parameters(&item.sig.inputs),
    });
    emit_schema(item, record, "component")
}

#[proc_macro_attribute]
pub fn store(attribute: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemImpl);
    let name = type_name(&item.self_ty);
    let id = match schema_id(attribute, &name) {
        Ok(id) => id,
        Err(error) => return error.into_compile_error().into(),
    };
    let actions = item
        .items
        .iter()
        .filter_map(|member| match member {
            ImplItem::Fn(method) if has_vooya_attribute(&method.attrs, "action") => Some(json!({
                "name": method.sig.ident.to_string(),
                "params": parameters(&method.sig.inputs),
            })),
            _ => None,
        })
        .collect::<Vec<_>>();
    let snapshot = item.items.iter().find_map(|member| match member {
        ImplItem::Fn(method) if has_vooya_attribute(&method.attrs, "snapshot") => {
            Some(method.sig.ident.to_string())
        }
        _ => None,
    });
    let record = json!({
        "version": SCHEMA_VERSION,
        "kind": "store",
        "id": id,
        "name": type_name(&item.self_ty),
        "actions": actions,
        "snapshot": snapshot,
    });
    emit_schema(item, record, "store")
}

/// Marks a method for inclusion in its enclosing `#[voo::store]` schema.
#[proc_macro_attribute]
pub fn action(_attribute: TokenStream, input: TokenStream) -> TokenStream {
    input
}

/// Marks a method as the snapshot producer in its enclosing `#[voo::store]`.
#[proc_macro_attribute]
pub fn snapshot(_attribute: TokenStream, input: TokenStream) -> TokenStream {
    input
}

fn emit_schema<T: quote::ToTokens>(item: T, record: Value, role: &str) -> TokenStream {
    let encoded = format!("{}\n", serde_json::to_string(&record).expect("schema JSON"));
    let bytes = syn::LitByteStr::new(encoded.as_bytes(), proc_macro2::Span::call_site());
    let length = encoded.len();
    let item_name = match &record["name"] {
        Value::String(value) => value,
        _ => "item",
    };
    let static_name = format_ident!(
        "__VOO_SCHEMA_V{}_{}_{}",
        SCHEMA_VERSION,
        role.to_uppercase(),
        sanitize_ident(item_name),
    );
    quote! {
        #item

        #[doc(hidden)]
        #[used]
        #[cfg_attr(target_arch = "wasm32", unsafe(link_section = "__voo_schema"))]
        static #static_name: [u8; #length] = *#bytes;
    }
    .into()
}

fn parameters(inputs: &syn::punctuated::Punctuated<FnArg, syn::token::Comma>) -> Vec<Value> {
    inputs
        .iter()
        .filter_map(|argument| match argument {
            FnArg::Typed(argument) => match argument.pat.as_ref() {
                Pat::Ident(ident) => Some(json!({
                    "name": ident.ident.to_string(),
                    "type": type_name(&argument.ty),
                })),
                _ => None,
            },
            FnArg::Receiver(_) => None,
        })
        .collect()
}

fn type_name(ty: &Type) -> String {
    quote!(#ty).to_string().replace(' ', "")
}

fn has_vooya_attribute(attributes: &[Attribute], expected: &str) -> bool {
    attributes.iter().any(|attribute| {
        let segments = &attribute.path().segments;
        segments.len() == 2 && segments[0].ident == "voo" && segments[1].ident == expected
    })
}

fn sanitize_ident(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn schema_id(attribute: TokenStream, fallback: &str) -> syn::Result<String> {
    if attribute.is_empty() {
        return Ok(fallback.to_owned());
    }
    let MetaNameValue { path, value, .. } = syn::parse(attribute)?;
    if !path.is_ident("id") {
        return Err(syn::Error::new_spanned(
            path,
            "expected `id = \"qualified::name\"`",
        ));
    }
    let Expr::Lit(expression) = value else {
        return Err(syn::Error::new_spanned(
            value,
            "schema id must be a string literal",
        ));
    };
    let Lit::Str(value) = expression.lit else {
        return Err(syn::Error::new_spanned(
            expression,
            "schema id must be a string literal",
        ));
    };
    if value.value().is_empty() {
        return Err(syn::Error::new_spanned(
            value,
            "schema id must not be empty",
        ));
    }
    Ok(value.value())
}
