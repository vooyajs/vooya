//! Authoring macros which emit versioned, build-time Vooya schema records.

use proc_macro::TokenStream;
use quote::{format_ident, quote};
use serde_json::{Value, json};
use syn::{
    Attribute, Data, DeriveInput, Expr, Fields, FnArg, ImplItem, ItemFn, ItemImpl, ItemStruct,
    ItemTrait, Lit, MetaNameValue, Pat, TraitItem, Type, parse_macro_input,
};
use syn::{
    Token, braced,
    parse::{Parse, ParseStream},
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

/// Builds the initial DOM-only RSX tree. The first argument is a `View` and
/// the remaining input is a deliberately small XML-like tree.
#[proc_macro]
pub fn rsx(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as RsxInput);
    expand_rsx_node(&input.root, &input.view).into()
}

struct RsxInput {
    view: Expr,
    root: RsxNode,
}

struct RsxNode {
    tag: syn::Ident,
    attributes: Vec<(syn::Ident, syn::LitStr)>,
    children: Vec<RsxChild>,
}

enum RsxChild {
    Node(RsxNode),
    Text(syn::LitStr),
    Expression(Expr),
}

impl Parse for RsxInput {
    fn parse(input: ParseStream<'_>) -> syn::Result<Self> {
        let view = input.parse()?;
        input.parse::<Token![,]>()?;
        Ok(Self {
            view,
            root: input.parse()?,
        })
    }
}

impl Parse for RsxNode {
    fn parse(input: ParseStream<'_>) -> syn::Result<Self> {
        input.parse::<Token![<]>()?;
        let tag: syn::Ident = input.parse()?;
        let mut attributes = Vec::new();
        while !input.peek(Token![>]) {
            let name: syn::Ident = input.parse()?;
            input.parse::<Token![=]>()?;
            attributes.push((name, input.parse()?));
        }
        input.parse::<Token![>]>()?;
        let mut children = Vec::new();
        while !is_closing_tag(input)? {
            if input.peek(Token![<]) {
                children.push(RsxChild::Node(input.parse()?));
            } else if input.peek(syn::LitStr) {
                children.push(RsxChild::Text(input.parse()?));
            } else if input.peek(syn::token::Brace) {
                let content;
                braced!(content in input);
                children.push(RsxChild::Expression(content.parse()?));
            } else {
                return Err(input.error("expected an RSX child or closing tag"));
            }
        }
        input.parse::<Token![<]>()?;
        input.parse::<Token![/]>()?;
        let closing: syn::Ident = input.parse()?;
        if closing != tag {
            return Err(syn::Error::new_spanned(
                closing,
                "RSX closing tag does not match opening tag",
            ));
        }
        input.parse::<Token![>]>()?;
        Ok(Self {
            tag,
            attributes,
            children,
        })
    }
}

fn is_closing_tag(input: ParseStream<'_>) -> syn::Result<bool> {
    if !input.peek(Token![<]) {
        return Ok(false);
    }
    let fork = input.fork();
    fork.parse::<Token![<]>()?;
    Ok(fork.peek(Token![/]))
}

fn expand_rsx_node(node: &RsxNode, view: &Expr) -> proc_macro2::TokenStream {
    let tag = node.tag.to_string();
    let attributes = node.attributes.iter().map(|(name, value)| {
        let name = name.to_string();
        quote! { __voo_element = __voo_element.attribute(#name, #value)?; }
    });
    let children = node.children.iter().map(|child| match child {
        RsxChild::Node(child) => {
            let child = expand_rsx_node(child, view);
            quote! { let __voo_child = #child?; __voo_element.append(&__voo_child)?; }
        }
        RsxChild::Text(value) => quote! { __voo_element = __voo_element.text(#value); },
        RsxChild::Expression(expression) => {
            quote! { __voo_element = __voo_element.text(&::std::format!("{}", #expression)); }
        }
    });
    quote! {{
        let mut __voo_element = (#view).element(#tag)?;
        #(#attributes)*
        #(#children)*
        ::core::result::Result::<_, ::vooya::__private::wasm_bindgen::JsValue>::Ok(__voo_element)
    }}
}

#[proc_macro_derive(FromJs)]
pub fn derive_from_js(input: TokenStream) -> TokenStream {
    derive_abi(parse_macro_input!(input as DeriveInput), AbiDirection::From)
}

#[proc_macro_derive(ToJs)]
pub fn derive_to_js(input: TokenStream) -> TokenStream {
    derive_abi(parse_macro_input!(input as DeriveInput), AbiDirection::To)
}

enum AbiDirection {
    From,
    To,
}

fn derive_abi(input: DeriveInput, direction: AbiDirection) -> TokenStream {
    if !input.generics.params.is_empty() {
        return syn::Error::new_spanned(
            input.generics,
            "generic public ABI is not supported in v1",
        )
        .into_compile_error()
        .into();
    }
    let name = input.ident;
    let generated = match (input.data, direction) {
        (Data::Struct(data), AbiDirection::From) => derive_struct_from(&name, data.fields),
        (Data::Struct(data), AbiDirection::To) => derive_struct_to(&name, data.fields),
        (Data::Enum(data), AbiDirection::From) => {
            derive_enum_from(&name, data.variants.into_iter().collect())
        }
        (Data::Enum(data), AbiDirection::To) => {
            derive_enum_to(&name, data.variants.into_iter().collect())
        }
        (Data::Union(data), _) => Err(syn::Error::new_spanned(
            data.union_token,
            "unions are not a public ABI type",
        )),
    };
    generated
        .unwrap_or_else(|error| error.into_compile_error())
        .into()
}

fn derive_struct_from(name: &syn::Ident, fields: Fields) -> syn::Result<proc_macro2::TokenStream> {
    let Fields::Named(fields) = fields else {
        return Err(syn::Error::new_spanned(
            fields,
            "FromJs supports named structs; use a Rust tuple for positional data",
        ));
    };
    let values = fields.named.iter().map(|field| {
        let ident = field.ident.as_ref().expect("named field");
        let ty = &field.ty;
        let key = ident.to_string();
        quote! { #ident: <#ty as ::vooya::FromJs>::from_js(&::vooya::__private::js_sys::Reflect::get(value, &::vooya::__private::wasm_bindgen::JsValue::from_str(#key)).map_err(|_| ::vooya::abi_error(concat!("could not read field ", #key)))?)? }
    });
    Ok(quote! {
        impl ::vooya::FromJs for #name {
            fn from_js(value: &::vooya::__private::wasm_bindgen::JsValue) -> Result<Self, ::vooya::__private::wasm_bindgen::JsValue> {
                if !value.is_object() || value.is_null() || ::vooya::__private::js_sys::Array::is_array(value) { return Err(::vooya::abi_error("expected object")); }
                Ok(Self { #(#values,)* })
            }
        }
    })
}

fn derive_struct_to(name: &syn::Ident, fields: Fields) -> syn::Result<proc_macro2::TokenStream> {
    let Fields::Named(fields) = fields else {
        return Err(syn::Error::new_spanned(
            fields,
            "ToJs supports named structs; use a Rust tuple for positional data",
        ));
    };
    let values = fields.named.iter().map(|field| {
        let ident = field.ident.as_ref().expect("named field");
        let key = ident.to_string();
        quote! { ::vooya::__private::js_sys::Reflect::set(&object, &::vooya::__private::wasm_bindgen::JsValue::from_str(#key), &::vooya::ToJs::to_js(&self.#ident)?).map_err(|_| ::vooya::abi_error(concat!("could not write field ", #key)))?; }
    });
    Ok(quote! {
        impl ::vooya::ToJs for #name {
            fn to_js(&self) -> Result<::vooya::__private::wasm_bindgen::JsValue, ::vooya::__private::wasm_bindgen::JsValue> {
                let object = ::vooya::__private::js_sys::Object::new();
                #(#values)*
                Ok(object.into())
            }
        }
    })
}

fn derive_enum_from(
    name: &syn::Ident,
    variants: Vec<syn::Variant>,
) -> syn::Result<proc_macro2::TokenStream> {
    let arms = variants
        .iter()
        .map(|variant| {
            if !matches!(variant.fields, Fields::Unit) {
                return Err(syn::Error::new_spanned(
                    &variant.fields,
                    "enum ABI v1 supports unit variants; use a named struct payload",
                ));
            }
            let variant_name = &variant.ident;
            let tag = variant_name.to_string();
            Ok(quote! { #tag => Ok(Self::#variant_name), })
        })
        .collect::<syn::Result<Vec<_>>>()?;
    Ok(quote! {
        impl ::vooya::FromJs for #name {
            fn from_js(value: &::vooya::__private::wasm_bindgen::JsValue) -> Result<Self, ::vooya::__private::wasm_bindgen::JsValue> {
                let tag = ::vooya::__private::js_sys::Reflect::get(value, &::vooya::__private::wasm_bindgen::JsValue::from_str("type")).map_err(|_| ::vooya::abi_error("could not read enum tag"))?.as_string().ok_or_else(|| ::vooya::abi_error("expected enum tag"))?;
                match tag.as_str() { #(#arms)* _ => Err(::vooya::abi_error("unknown enum tag")) }
            }
        }
    })
}

fn derive_enum_to(
    name: &syn::Ident,
    variants: Vec<syn::Variant>,
) -> syn::Result<proc_macro2::TokenStream> {
    let arms = variants
        .iter()
        .map(|variant| {
            if !matches!(variant.fields, Fields::Unit) {
                return Err(syn::Error::new_spanned(
                    &variant.fields,
                    "enum ABI v1 supports unit variants; use a named struct payload",
                ));
            }
            let variant_name = &variant.ident;
            let tag = variant_name.to_string();
            Ok(quote! { Self::#variant_name => #tag, })
        })
        .collect::<syn::Result<Vec<_>>>()?;
    Ok(quote! {
        impl ::vooya::ToJs for #name {
            fn to_js(&self) -> Result<::vooya::__private::wasm_bindgen::JsValue, ::vooya::__private::wasm_bindgen::JsValue> {
                let object = ::vooya::__private::js_sys::Object::new();
                let tag = match self { #(#arms)* };
                ::vooya::__private::js_sys::Reflect::set(&object, &::vooya::__private::wasm_bindgen::JsValue::from_str("type"), &::vooya::__private::wasm_bindgen::JsValue::from_str(tag)).map_err(|_| ::vooya::abi_error("could not write enum tag"))?;
                Ok(object.into())
            }
        }
    })
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
