//! `#[derive(FromJs)]` and `#[derive(ToJs)]`: directional JSON-compatible
//! encoding between Rust user types and `JsValue`, following serde's
//! `Serialize` / `Deserialize` split.
//!
//! Structs encode to a plain object of field names. Enums encode to a
//! discriminated union: `{ type: "Variant" }` for unit variants and
//! `{ type: "Variant", value: <field> }` for a single unnamed field. The
//! TypeScript the build layer emits mirrors exactly this shape.

use proc_macro2::TokenStream;
use quote::quote;
use syn::{Data, DeriveInput, Fields, Ident, Type};

use crate::schema::emit_schema;

pub fn derive_from_js(input: &DeriveInput) -> TokenStream {
    let name = &input.ident;
    let decode = match &input.data {
        Data::Struct(data) => decode_struct(name, &data.fields),
        Data::Enum(data) => decode_enum(name, data),
        Data::Union(data) => {
            return syn::Error::new_spanned(
                &data.union_token,
                "vooya FromJs derive does not support unions",
            )
            .to_compile_error();
        }
    };
    let schema = type_schema(name, input);
    quote! {
        #schema
        impl vooya::FromJs for #name {
            fn from_js(value: &::wasm_bindgen::JsValue) -> Result<Self, ::wasm_bindgen::JsValue> {
                #decode
            }
        }
    }
}

/// The statement sequence that decodes the fields of `fields` from a `JsValue`
/// binding named `value` and constructs the struct. Used by both the `FromJs`
/// derive and `#[derive(Props)]`.
pub fn decode_body(name: &Ident, fields: &Fields) -> TokenStream {
    decode_struct(name, fields)
}

pub fn derive_to_js(input: &DeriveInput) -> TokenStream {
    let name = &input.ident;
    let encode = match &input.data {
        Data::Struct(data) => encode_struct(name, &data.fields),
        Data::Enum(data) => encode_enum(name, data),
        Data::Union(data) => {
            return syn::Error::new_spanned(
                &data.union_token,
                "vooya ToJs derive does not support unions",
            )
            .to_compile_error();
        }
    };
    quote! {
        impl vooya::ToJs for #name {
            fn to_js(&self) -> Result<::wasm_bindgen::JsValue, ::wasm_bindgen::JsValue> {
                #encode
            }
        }
    }
}

fn type_schema(name: &Ident, input: &DeriveInput) -> TokenStream {
    let json = match &input.data {
        Data::Struct(data) => format!(
            r#"{{"kind":"type","name":{},"fields":[{}]}}"#,
            crate::schema::json_string(&name.to_string()),
            fields_json(&data.fields)
        ),
        Data::Enum(data) => {
            let variants = data
                .variants
                .iter()
                .map(|variant| {
                    let variant_name = variant.ident.to_string();
                    let fields = variant_fields_json(&variant.fields);
                    format!(
                        r#"{{"name":{},"fields":[{}]}}"#,
                        crate::schema::json_string(&variant_name),
                        fields
                    )
                })
                .collect::<Vec<_>>();
            format!(
                r#"{{"kind":"type","name":{},"variants":[{}]}}"#,
                crate::schema::json_string(&name.to_string()),
                variants.join(",")
            )
        }
        Data::Union(_) => String::new(),
    };
    emit_schema("type", &name.to_string(), &json)
}

fn fields_json(fields: &Fields) -> String {
    match fields {
        Fields::Named(fields) => fields
            .named
            .iter()
            .map(|field| {
                let name = field.ident.as_ref().expect("named field").to_string();
                crate::schema::field(&name, &type_string(&field.ty))
            })
            .collect::<Vec<_>>()
            .join(","),
        Fields::Unnamed(fields) => fields
            .unnamed
            .iter()
            .enumerate()
            .map(|(index, field)| crate::schema::field(&index.to_string(), &type_string(&field.ty)))
            .collect::<Vec<_>>()
            .join(","),
        Fields::Unit => String::new(),
    }
}

fn variant_fields_json(fields: &Fields) -> String {
    match fields {
        Fields::Unnamed(fields) => fields
            .unnamed
            .iter()
            .map(|field| crate::schema::field("value", &type_string(&field.ty)))
            .collect::<Vec<_>>()
            .join(","),
        Fields::Named(fields) => fields
            .named
            .iter()
            .map(|field| {
                let name = field.ident.as_ref().expect("named field").to_string();
                crate::schema::field(&name, &type_string(&field.ty))
            })
            .collect::<Vec<_>>()
            .join(","),
        Fields::Unit => String::new(),
    }
}

pub fn type_string(ty: &Type) -> String {
    let mut rendered = quote!(#ty).to_string();
    if let Some(rest) = rendered.strip_prefix("::") {
        rendered = rest.to_string();
    }
    rendered
}

fn decode_struct(_name: &Ident, fields: &Fields) -> TokenStream {
    match fields {
        Fields::Named(fields) => {
            let bindings = fields.named.iter().map(|field| {
                let field_name = field.ident.as_ref().expect("named field");
                let key = crate::schema::wire_key(&field_name.to_string());
                let ty = &field.ty;
                quote! {
                    let #field_name = <#ty as vooya::FromJs>::from_js(
                        &::js_sys::Reflect::get(value, &#key.into())?,
                    )?;
                }
            });
            let field_names = fields.named.iter().map(|field| field.ident.as_ref().unwrap());
            quote! {
                #(#bindings)*
                Ok(Self { #(#field_names),* })
            }
        }
        Fields::Unnamed(fields) => {
            let bindings = fields.unnamed.iter().enumerate().map(|(index, field)| {
                let key = index.to_string();
                let ty = &field.ty;
                quote! {
                    <#ty as vooya::FromJs>::from_js(
                        &::js_sys::Reflect::get(value, &#key.into())?,
                    )?
                }
            });
            quote! { Ok(Self(#(#bindings),*)) }
        }
        Fields::Unit => quote! { Ok(Self) },
    }
}

fn encode_struct(_name: &Ident, fields: &Fields) -> TokenStream {
    match fields {
        Fields::Named(fields) => {
            let writes = fields.named.iter().map(|field| {
                let field_name = field.ident.as_ref().expect("named field");
                let key = crate::schema::wire_key(&field_name.to_string());
                let ty = &field.ty;
                quote! {
                    ::js_sys::Reflect::set(
                        &object,
                        &#key.into(),
                        &<#ty as vooya::ToJs>::to_js(&self.#field_name)?,
                    )?;
                }
            });
            quote! {
                let object = ::js_sys::Object::new();
                #(#writes)*
                Ok(object.into())
            }
        }
        Fields::Unnamed(fields) => {
            let writes = fields.unnamed.iter().enumerate().map(|(index, field)| {
                let key = index.to_string();
                let ty = &field.ty;
                quote! {
                    ::js_sys::Reflect::set(
                        &object,
                        &#key.into(),
                        &<#ty as vooya::ToJs>::to_js(&self.#index)?,
                    )?;
                }
            });
            quote! {
                let object = ::js_sys::Object::new();
                #(#writes)*
                Ok(object.into())
            }
        }
        Fields::Unit => quote! {
            let object = ::js_sys::Object::new();
            Ok(object.into())
        },
    }
}

fn decode_enum(name: &Ident, data: &syn::DataEnum) -> TokenStream {
    let arms = data.variants.iter().map(|variant| {
        let variant_ident = &variant.ident;
        let variant_name = variant_ident.to_string();
        let arm = match &variant.fields {
            Fields::Unit => quote! {
                #variant_name => Ok(Self::#variant_ident),
            },
            Fields::Unnamed(fields) => {
                let field_ty = &fields.unnamed[0].ty;
                quote! {
                    #variant_name => {
                        let value = <#field_ty as vooya::FromJs>::from_js(
                            &::js_sys::Reflect::get(value, &"value".into())?,
                        )?;
                        Ok(Self::#variant_ident(value))
                    }
                }
            }
            Fields::Named(fields) => {
                let (names, types): (Vec<_>, Vec<_>) = fields
                    .named
                    .iter()
                    .map(|field| (field.ident.as_ref().unwrap(), &field.ty))
                    .unzip();
                let reads = names.iter().zip(&types).map(|(field_name, ty)| {
                    let key = crate::schema::wire_key(&field_name.to_string());
                    quote! {
                        let #field_name = <#ty as vooya::FromJs>::from_js(
                            &::js_sys::Reflect::get(value, &#key.into())?,
                        )?;
                    }
                });
                quote! {
                    #variant_name => {
                        #(#reads)*
                        Ok(Self::#variant_ident { #(#names),* })
                    }
                }
            }
        };
        arm
    });
    quote! {
        let tag = ::js_sys::Reflect::get(value, &"type".into())?
            .as_string()
            .ok_or_else(|| ::wasm_bindgen::JsValue::from_str("Vooya enum value is missing a string `type` field"))?;
        match tag.as_str() {
            #(#arms)*
            _ => Err(::wasm_bindgen::JsValue::from_str(&format!(
                "Vooya enum {} has no variant {tag}",
                stringify!(#name)
            ))),
        }
    }
}

fn encode_enum(_name: &Ident, data: &syn::DataEnum) -> TokenStream {
    let arms = data.variants.iter().map(|variant| {
        let variant_ident = &variant.ident;
        let variant_name = variant_ident.to_string();
        match &variant.fields {
            Fields::Unit => quote! {
                Self::#variant_ident => {
                    ::js_sys::Reflect::set(&object, &"type".into(), &#variant_name.into())?;
                }
            },
            Fields::Unnamed(fields) => {
                let field_ty = &fields.unnamed[0].ty;
                quote! {
                    Self::#variant_ident(value) => {
                        ::js_sys::Reflect::set(&object, &"type".into(), &#variant_name.into())?;
                        ::js_sys::Reflect::set(
                            &object,
                            &"value".into(),
                            &<#field_ty as vooya::ToJs>::to_js(value)?,
                        )?;
                    }
                }
            }
            Fields::Named(fields) => {
                let names: Vec<_> = fields.named.iter().map(|f| f.ident.as_ref().unwrap()).collect();
                let writes = names.iter().map(|field_name| {
                    let key = crate::schema::wire_key(&field_name.to_string());
                    quote! {
                        ::js_sys::Reflect::set(
                            &object,
                            &#key.into(),
                            &<#field_name as vooya::ToJs>::to_js(#field_name)?,
                        )?;
                    }
                });
                quote! {
                    Self::#variant_ident { #(#names),* } => {
                        ::js_sys::Reflect::set(&object, &"type".into(), &#variant_name.into())?;
                        #(#writes)*
                    }
                }
            }
        }
    });
    quote! {
        let object = ::js_sys::Object::new();
        match self {
            #(#arms)*
        }
        Ok(object.into())
    }
}

pub fn parse_derive(input: proc_macro::TokenStream) -> Result<DeriveInput, syn::Error> {
    syn::parse(input)
}
