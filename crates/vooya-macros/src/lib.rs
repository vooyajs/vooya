//! Authoring macros which emit versioned, build-time Vooya schema records.

use proc_macro::TokenStream;
use quote::{format_ident, quote};
use serde_json::{Value, json};
use syn::{
    Attribute, Data, DeriveInput, Expr, Fields, FnArg, ImplItem, ItemFn, ItemImpl, ItemStruct,
    ItemTrait, Lit, MetaNameValue, Pat, TraitItem, Type, parse_macro_input,
};
use syn::spanned::Spanned;
use syn::{
    Token, braced,
    parse::{Parse, ParseStream, Parser},
};
use syn::punctuated::Punctuated;

const SCHEMA_VERSION: u32 = 1;

#[proc_macro_attribute]
pub fn props(attribute: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemStruct);
    let name = item.ident.to_string();
    let metadata = match schema_metadata(attribute, &name, item.span().file()) {
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
        "id": metadata.id,
        "name": item.ident.to_string(),
        "group": metadata.group,
        "fields": fields,
    });
    emit_schema(item, record, "props")
}

#[proc_macro_attribute]
pub fn events(attribute: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemTrait);
    let name = item.ident.to_string();
    let metadata = match schema_metadata(attribute, &name, item.span().file()) {
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
        "id": metadata.id,
        "name": item.ident.to_string(),
        "group": metadata.group,
        "methods": methods,
    });
    emit_schema(item, record, "events")
}

#[proc_macro_attribute]
pub fn component(attribute: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemFn);
    let name = item.sig.ident.to_string();
    let function_name = item.sig.ident.clone();
    let metadata = match schema_metadata(attribute, &name, item.span().file()) {
        Ok(id) => id,
        Err(error) => return error.into_compile_error().into(),
    };
    let record = json!({
        "version": SCHEMA_VERSION,
        "kind": "component",
        "id": metadata.id,
        "name": item.sig.ident.to_string(),
        "group": metadata.group,
        "params": parameters(&item.sig.inputs),
        "return": return_type(&item.sig.output),
    });
    let schema: proc_macro2::TokenStream = emit_schema(item.clone(), record, "component").into();
    let Some(props_type) = component_parameters(&item) else {
        return syn::Error::new_spanned(
            item.sig,
            "#[voo::component] requires `(&vooya::View, Props) -> Result<vooya::ViewElement, JsValue>`",
        )
        .into_compile_error()
        .into();
    };
    let return_text = return_type(&item.sig.output);
    if !return_text.contains("Result") || !return_text.contains("ViewElement") {
        return syn::Error::new_spanned(
            item.sig.output,
            "#[voo::component] must return `Result<vooya::ViewElement, JsValue>`",
        )
        .into_compile_error()
        .into();
    }
    let stem = snake_case_ident(&name);
    let mount_name = format_ident!("voo_{}_mount", stem);
    let update_name = format_ident!("voo_{}_update_props", stem);
    let dispose_name = format_ident!("voo_{}_dispose", stem);
    let handles_name = format_ident!("VOO_{}_HANDLES", stem.to_uppercase());
    let handle_name = format_ident!("Voo{}Handle", name);
    let generated = quote! {
        #schema

        #[doc(hidden)]
        struct #handle_name {
            host: ::vooya::__private::web_sys::Element,
            root: ::vooya::ViewElement,
        }

        thread_local! {
            static #handles_name: ::std::cell::RefCell<::std::vec::Vec<::core::option::Option<#handle_name>>> = const { ::std::cell::RefCell::new(::std::vec::Vec::new()) };
        }

        #[::vooya::__private::wasm_bindgen::prelude::wasm_bindgen]
        pub fn #mount_name(host: ::vooya::__private::web_sys::Element, props: ::vooya::__private::wasm_bindgen::JsValue) -> ::core::result::Result<u32, ::vooya::__private::wasm_bindgen::JsValue> {
            let view = ::vooya::View::from_host(&host)?;
            let props = <#props_type as ::vooya::FromJs>::from_js(&props)?;
            let root = #function_name(&view, props)?;
            root.mount(&host)?;
            #handles_name.with(|handles| {
                let mut handles = handles.borrow_mut();
                handles.push(::core::option::Option::Some(#handle_name { host, root }));
                ::core::result::Result::Ok((handles.len() - 1) as u32)
            })
        }

        #[::vooya::__private::wasm_bindgen::prelude::wasm_bindgen]
        pub fn #update_name(handle: u32, props: ::vooya::__private::wasm_bindgen::JsValue) -> ::core::result::Result<(), ::vooya::__private::wasm_bindgen::JsValue> {
            #handles_name.with(|handles| {
                let mut handles = handles.borrow_mut();
                let Some(Some(existing)) = handles.get_mut(handle as usize) else {
                    return ::core::result::Result::Err(::vooya::abi_error("invalid component handle"));
                };
                let props = <#props_type as ::vooya::FromJs>::from_js(&props)?;
                existing.root.remove();
                let view = ::vooya::View::from_host(&existing.host)?;
                let root = #function_name(&view, props)?;
                root.mount(&existing.host)?;
                existing.root = root;
                ::core::result::Result::Ok(())
            })
        }

        #[::vooya::__private::wasm_bindgen::prelude::wasm_bindgen]
        pub fn #dispose_name(handle: u32) {
            #handles_name.with(|handles| {
                let mut handles = handles.borrow_mut();
                if let Some(slot) = handles.get_mut(handle as usize) {
                    let Some(existing) = slot.take() else { return };
                    existing.root.remove();
                }
            });
        }
    };
    generated.into()
}

fn component_parameters(item: &ItemFn) -> Option<Type> {
    if item.sig.inputs.len() != 2 {
        return None;
    }
    let mut inputs = item.sig.inputs.iter();
    let FnArg::Typed(view) = inputs.next()? else { return None };
    let FnArg::Typed(props) = inputs.next()? else { return None };
    let Pat::Ident(_) = view.pat.as_ref() else { return None };
    let Pat::Ident(_) = props.pat.as_ref() else { return None };
    let view_type = type_name(&view.ty);
    if !view_type.contains("View") {
        return None;
    }
    Some((*props.ty).clone())
}

#[proc_macro_attribute]
pub fn store(attribute: TokenStream, input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as ItemImpl);
    let name = type_name(&item.self_ty);
    let store_type = item.self_ty.clone();
    let metadata = match schema_metadata(attribute, &name, item.span().file()) {
        Ok(id) => id,
        Err(error) => return error.into_compile_error().into(),
    };
    let action_methods = item
        .items
        .iter()
        .filter_map(|member| match member {
            ImplItem::Fn(method) if has_vooya_attribute(&method.attrs, "action") => Some(method),
            _ => None,
        })
        .collect::<Vec<_>>();
    let actions = action_methods
        .iter()
        .map(|method| json!({
                "name": method.sig.ident.to_string(),
                "params": parameters(&method.sig.inputs),
            }))
        .collect::<Vec<_>>();
    let snapshot_method = item.items.iter().find_map(|member| match member {
        ImplItem::Fn(method) if has_vooya_attribute(&method.attrs, "snapshot") => {
            Some(method)
        }
        _ => None,
    });
    let snapshot = snapshot_method.map(|method| return_type(&method.sig.output));
    let record = json!({
        "version": SCHEMA_VERSION,
        "kind": "store",
        "id": metadata.id,
        "name": type_name(&item.self_ty),
        "group": metadata.group,
        "actions": actions,
        "snapshot": snapshot,
    });
    let schema: proc_macro2::TokenStream = emit_schema(item.clone(), record, "store").into();
    let stem = snake_case_ident(&name);
    let handle_name = format_ident!("Voo{}StoreHandle", sanitize_ident(&name));
    let handles_name = format_ident!("VOO_{}_STORE_HANDLES", stem.to_uppercase());
    let create_name = format_ident!("voo_{}_store_create", stem);
    let snapshot_name = format_ident!("voo_{}_store_snapshot", stem);
    let subscribe_name = format_ident!("voo_{}_store_subscribe", stem);
    let unsubscribe_name = format_ident!("voo_{}_store_unsubscribe", stem);
    let dispose_name = format_ident!("voo_{}_store_dispose", stem);
    let Some(snapshot_method) = snapshot_method else {
        return syn::Error::new_spanned(
            &item.self_ty,
            "#[voo::store] requires one #[voo::snapshot] method",
        ).into_compile_error().into();
    };
    let snapshot_type = match &snapshot_method.sig.output {
        syn::ReturnType::Type(_, ty) => ty.clone(),
        syn::ReturnType::Default => {
            return syn::Error::new_spanned(&snapshot_method.sig.output, "#[voo::snapshot] must return a ToJs + PartialEq snapshot value")
                .into_compile_error().into();
        }
    };
    let snapshot_method_name = &snapshot_method.sig.ident;
    let action_exports = action_methods.iter().map(|method| {
        let method_name = &method.sig.ident;
        let export_name = format_ident!("voo_{}_store_{}", stem, method_name);
        let mut js_parameters = Vec::new();
        let mut decoded_parameters = Vec::new();
        let mut call_parameters = Vec::new();
        for (index, input) in method.sig.inputs.iter().filter_map(|input| match input {
            FnArg::Typed(input) => Some(input),
            FnArg::Receiver(_) => None,
        }).enumerate() {
            let parameter_name = match input.pat.as_ref() {
                Pat::Ident(pattern) => pattern.ident.clone(),
                _ => format_ident!("argument_{}", index),
            };
            let js_name = format_ident!("__voo_js_arg_{}", index);
            let ty = &input.ty;
            js_parameters.push(quote! { #js_name: ::vooya::__private::wasm_bindgen::JsValue });
            decoded_parameters.push(quote! {
                let #parameter_name = <#ty as ::vooya::FromJs>::from_js(&#js_name)?;
            });
            call_parameters.push(quote! { #parameter_name });
        }
        let returns_result = matches!(&method.sig.output, syn::ReturnType::Type(_, ty) if type_name(ty).replace(' ', "").starts_with("Result<"));
        let invoke = match &method.sig.output {
            syn::ReturnType::Type(_, ty) if type_name(ty).replace(' ', "").starts_with("Result<") => {
                quote! { state.#method_name(#(#call_parameters),*)?; ::core::result::Result::<(), ::vooya::__private::wasm_bindgen::JsValue>::Ok(()) }
            }
            _ => quote! { let _ = state.#method_name(#(#call_parameters),*); },
        };
        let dispatch = if returns_result {
            quote! { existing.store.dispatch(|state| { #invoke })?; }
        } else {
            quote! { existing.store.dispatch(|state| { #invoke }); }
        };
        quote! {
            #[::vooya::__private::wasm_bindgen::prelude::wasm_bindgen]
            pub fn #export_name(handle: u32, #(#js_parameters),*) -> ::core::result::Result<(), ::vooya::__private::wasm_bindgen::JsValue> {
                #(#decoded_parameters)*
                #handles_name.with(|handles| {
                    let handles = handles.borrow();
                    let Some(Some(existing)) = handles.get(handle as usize) else {
                        return ::core::result::Result::Err(::vooya::abi_error("invalid store handle"));
                    };
                    #dispatch
                    ::core::result::Result::Ok(())
                })
            }
        }
    });
    let generated = quote! {
        #schema

        impl ::vooya::StoreState for #store_type {
            type Snapshot = #snapshot_type;

            fn snapshot(&self) -> Self::Snapshot {
                self.#snapshot_method_name()
            }
        }

        #[doc(hidden)]
        struct #handle_name {
            store: ::vooya::Store<#store_type>,
            subscriptions: ::std::cell::RefCell<::std::vec::Vec<::core::option::Option<::vooya::Subscription<#store_type>>>>,
        }

        thread_local! {
            static #handles_name: ::std::cell::RefCell<::std::vec::Vec<::core::option::Option<#handle_name>>> = const { ::std::cell::RefCell::new(::std::vec::Vec::new()) };
        }

        #[::vooya::__private::wasm_bindgen::prelude::wasm_bindgen]
        pub fn #create_name() -> ::core::result::Result<u32, ::vooya::__private::wasm_bindgen::JsValue> {
            #handles_name.with(|handles| {
                let mut handles = handles.borrow_mut();
                handles.push(::core::option::Option::Some(#handle_name {
                    store: ::vooya::Store::new(<#store_type as ::core::default::Default>::default()),
                    subscriptions: ::std::cell::RefCell::new(::std::vec::Vec::new()),
                }));
                ::core::result::Result::Ok((handles.len() - 1) as u32)
            })
        }

        #[::vooya::__private::wasm_bindgen::prelude::wasm_bindgen]
        pub fn #snapshot_name(handle: u32) -> ::core::result::Result<::vooya::__private::wasm_bindgen::JsValue, ::vooya::__private::wasm_bindgen::JsValue> {
            #handles_name.with(|handles| {
                let handles = handles.borrow();
                let Some(Some(existing)) = handles.get(handle as usize) else {
                    return ::core::result::Result::Err(::vooya::abi_error("invalid store handle"));
                };
                let _ = &existing.store;
                existing.store.snapshot_js()
            })
        }

        #[::vooya::__private::wasm_bindgen::prelude::wasm_bindgen]
        pub fn #subscribe_name(handle: u32, listener: ::vooya::__private::js_sys::Function) -> ::core::result::Result<u32, ::vooya::__private::wasm_bindgen::JsValue> {
            #handles_name.with(|handles| {
                let handles = handles.borrow();
                let Some(Some(existing)) = handles.get(handle as usize) else {
                    return ::core::result::Result::Err(::vooya::abi_error("invalid store handle"));
                };
                let subscription = existing.store.subscribe(move || {
                    let _ = listener.call0(&::vooya::__private::wasm_bindgen::JsValue::UNDEFINED);
                });
                let mut subscriptions = existing.subscriptions.borrow_mut();
                subscriptions.push(::core::option::Option::Some(subscription));
                ::core::result::Result::Ok((subscriptions.len() - 1) as u32)
            })
        }

        #[::vooya::__private::wasm_bindgen::prelude::wasm_bindgen]
        pub fn #unsubscribe_name(handle: u32, subscription: u32) {
            #handles_name.with(|handles| {
                let handles = handles.borrow();
                if let Some(Some(existing)) = handles.get(handle as usize) {
                    if let Some(Some(mut subscription)) = existing.subscriptions.borrow_mut().get_mut(subscription as usize).map(|slot| slot.take()) {
                        subscription.unsubscribe();
                    }
                }
            });
        }

        #[::vooya::__private::wasm_bindgen::prelude::wasm_bindgen]
        pub fn #dispose_name(handle: u32) {
            #handles_name.with(|handles| {
                let mut handles = handles.borrow_mut();
                let Some(Some(existing)) = handles.get_mut(handle as usize) else { return; };
                existing.store.dispose();
                existing.subscriptions.borrow_mut().clear();
                handles[handle as usize] = ::core::option::Option::None;
            });
        }

        #(#action_exports)*
    };
    generated.into()
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
    attributes: Vec<(syn::Ident, RsxAttributeValue)>,
    children: Vec<RsxChild>,
}

enum RsxAttributeValue {
    Literal(syn::LitStr),
    Expression(Expr),
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
            let value = if input.peek(syn::LitStr) {
                RsxAttributeValue::Literal(input.parse()?)
            } else if input.peek(syn::token::Brace) {
                let content;
                braced!(content in input);
                RsxAttributeValue::Expression(content.parse()?)
            } else {
                return Err(input.error("expected a string literal or braced RSX attribute expression"));
            };
            attributes.push((name, value));
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
        match value {
            RsxAttributeValue::Literal(value) => quote! { __voo_element = __voo_element.attribute(#name, #value)?; },
            RsxAttributeValue::Expression(expression) => {
                if let Expr::MethodCall(call) = expression {
                    if call.method == "get" && call.args.is_empty() {
                        let receiver = &call.receiver;
                        quote! { __voo_element.bind_attribute(#name, &(#receiver))?; }
                    } else {
                        quote! { __voo_element = __voo_element.attribute(#name, &::std::format!("{}", #expression))?; }
                    }
                } else {
                    quote! { __voo_element = __voo_element.attribute(#name, &::std::format!("{}", #expression))?; }
                }
            }
        }
    });
    let children = node.children.iter().map(|child| match child {
        RsxChild::Node(child) => {
            let child = expand_rsx_node(child, view);
            quote! { let __voo_child = #child?; __voo_element.append(&__voo_child)?; }
        }
        RsxChild::Text(value) => quote! { __voo_element = __voo_element.text(#value); },
        RsxChild::Expression(expression) => {
            if let Expr::MethodCall(call) = expression {
                if call.method == "get" && call.args.is_empty() {
                    let receiver = &call.receiver;
                    quote! { __voo_element.bind_text(&(#receiver)); }
                } else {
                    quote! { __voo_element = __voo_element.text(&::std::format!("{}", #expression)); }
                }
            } else {
                quote! { __voo_element = __voo_element.text(&::std::format!("{}", #expression)); }
            }
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

fn return_type(output: &syn::ReturnType) -> String {
    match output {
        syn::ReturnType::Default => "()".to_owned(),
        syn::ReturnType::Type(_, ty) => type_name(ty),
    }
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

fn snake_case_ident(value: &str) -> String {
    let mut output = String::new();
    for (index, character) in value.chars().enumerate() {
        if character.is_ascii_uppercase() {
            if index > 0 { output.push('_'); }
            output.push(character.to_ascii_lowercase());
        } else if character.is_ascii_alphanumeric() || character == '_' {
            output.push(character);
        } else {
            output.push('_');
        }
    }
    if output.is_empty() { "store".to_owned() } else { output }
}

struct SchemaMetadata {
    id: String,
    group: Option<String>,
}

fn schema_metadata(attribute: TokenStream, fallback: &str, source_file: String) -> syn::Result<SchemaMetadata> {
    if attribute.is_empty() {
        return Ok(SchemaMetadata { id: fallback.to_owned(), group: Some(source_file) });
    }
    let values = Punctuated::<MetaNameValue, Token![,]>::parse_terminated.parse(attribute.into())?;
    let mut id = None;
    let mut group = None;
    for value in values {
        let path = value.path.clone();
        let key = path.get_ident().map(|ident| ident.to_string()).ok_or_else(|| {
            syn::Error::new_spanned(&path, "schema metadata keys must be identifiers")
        })?;
        let Expr::Lit(expression) = value.value else {
            return Err(syn::Error::new_spanned(path, "schema metadata values must be string literals"));
        };
        let Lit::Str(literal) = expression.lit else {
            return Err(syn::Error::new_spanned(expression, "schema metadata values must be string literals"));
        };
        if literal.value().is_empty() {
            return Err(syn::Error::new_spanned(literal, "schema metadata values must not be empty"));
        }
        match key.as_str() {
            "id" if id.is_none() => id = Some(literal.value()),
            "group" if group.is_none() => group = Some(literal.value()),
            "id" | "group" => return Err(syn::Error::new_spanned(path, "schema metadata key is duplicated")),
            _ => return Err(syn::Error::new_spanned(path, "expected `id = \"...\"` and optional `group = \"...\"`")),
        }
    }
    Ok(SchemaMetadata { id: id.unwrap_or_else(|| fallback.to_owned()), group: Some(group.unwrap_or(source_file)) })
}
