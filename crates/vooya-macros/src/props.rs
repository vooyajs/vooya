//! `#[derive(Props)]`: whole-object `FromJs` decoding plus key-dispatched
//! `PropSink` updates.
//!
//! The `PropSink::set(&mut self, key, value)` `match` arms are the only place
//! the field names appear: a `#[voo::component]` wrapper forwards
//! `update(key, value)` here without ever knowing the field list.

use proc_macro2::{Ident, TokenStream};
use quote::quote;
use syn::{Data, DeriveInput, Fields};

use crate::schema::emit_schema;
use crate::{js, schema};

pub fn derive_props(input: &DeriveInput) -> TokenStream {
    let name = &input.ident;
    let Data::Struct(data) = &input.data else {
        return syn::Error::new_spanned(
            &input.ident,
            "vooya Props derive requires a struct",
        )
        .to_compile_error();
    };
    let decode = js::decode_body(name, &data.fields);
    let sink = props_sink(name, &data.fields);
    let json = format!(
        r#"{{"kind":"props","name":{},"fields":[{}]}}"#,
        schema::json_string(&name.to_string()),
        fields_json(&data.fields)
    );
    let schema_static = emit_schema("props", &name.to_string(), &json);
    quote! {
        #schema_static
        impl vooya::FromJs for #name {
            fn from_js(value: &::wasm_bindgen::JsValue) -> Result<Self, ::wasm_bindgen::JsValue> {
                #decode
            }
        }
        impl vooya::PropSink for #name {
            fn set(
                &mut self,
                key: &str,
                value: ::wasm_bindgen::JsValue,
            ) -> Result<(), ::wasm_bindgen::JsValue> {
                #sink
            }
        }
    }
}

fn props_sink(name: &Ident, fields: &Fields) -> TokenStream {
    match fields {
        Fields::Named(fields) => {
            let arms = fields.named.iter().map(|field| {
                let field_name = field.ident.as_ref().expect("named field");
                let key = schema::wire_key(&field_name.to_string());
                let ty = &field.ty;
                quote! {
                    #key => {
                        self.#field_name = <#ty as vooya::FromJs>::from_js(&value)?;
                        Ok(())
                    }
                }
            });
            quote! {
                match key {
                    #(#arms)*
                    _ => Err(::wasm_bindgen::JsValue::from_str(&format!(
                        "Vooya Props {} has no field `{key}`",
                        stringify!(#name)
                    ))),
                }
            }
        }
        Fields::Unit | Fields::Unnamed(_) => quote! {
            Err(::wasm_bindgen::JsValue::from_str("Vooya Props {} is not a named-field struct"))
        },
    }
}

fn fields_json(fields: &Fields) -> String {
    match fields {
        Fields::Named(fields) => fields
            .named
            .iter()
            .map(|field| {
                let name = field.ident.as_ref().expect("named field").to_string();
                schema::field(&name, &js::type_string(&field.ty))
            })
            .collect::<Vec<_>>()
            .join(","),
        Fields::Unnamed(fields) => fields
            .unnamed
            .iter()
            .enumerate()
            .map(|(index, field)| schema::field(&index.to_string(), &js::type_string(&field.ty)))
            .collect::<Vec<_>>()
            .join(","),
        Fields::Unit => String::new(),
    }
}
