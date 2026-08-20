//! `#[voo::events]`: a trait whose methods become typed component events.
//!
//! The macro re-emits the trait unchanged, emits a concrete dispatcher
//! (`EventsImpl`) that forwards each method to a transport-agnostic
//! `vooya::EventSink`, and records the event methods into `__voo_schema`.
//!
//! The mode macros (`#[voo::component]`, `#[voo::store]`) construct the
//! dispatcher with the concrete sink for their transport: a `vooya-` prefixed
//! `CustomEvent` on the host element for DOM components, and a JavaScript
//! callback for state stores.

use proc_macro2::TokenStream;
use quote::quote;
use syn::{FnArg, ItemTrait, Type};

use crate::schema::{emit_schema, json_string};

pub fn expand_events(args: TokenStream, input: TokenStream) -> TokenStream {
    if !args.is_empty() {
        return syn::Error::new(
            proc_macro2::Span::call_site(),
            "#[voo::events] takes no arguments",
        )
        .to_compile_error();
    }
    let item: ItemTrait = match syn::parse2(input) {
        Ok(item) => item,
        Err(error) => return error.to_compile_error(),
    };
    expand(item)
}

fn expand(item: ItemTrait) -> TokenStream {
    let trait_name = &item.ident;
    let impl_name = syn::Ident::new(
        &format!("{}Impl", item.ident),
        item.ident.span(),
    );

    let methods = &item.items;
    let dispatcher_methods = methods.iter().filter_map(|item| match item {
        syn::TraitItem::Fn(method) => Some(method),
        _ => None,
    });

    let method_bodies = dispatcher_methods.clone().map(|method| {
        let method_name = &method.sig.ident;
        let method_name_quoted = method_name.to_string();
        let args: Vec<&FnArg> = method.sig.inputs.iter().collect();
        let (receiver, params) = split_receiver(args);
        if receiver.is_none() {
            return quote! {
                compile_error!("Vooya events methods must take &self");
            };
        }
        let dispatch = event_payload(&params);
        quote! {
            fn #method_name(&self, #(#params),*) {
                self.sink.dispatch(#method_name_quoted, #dispatch);
            }
        }
    });

    let schema_json = schema_json(&item, impl_name.clone());
    let schema_static = emit_schema("events", &trait_name.to_string(), &schema_json);

    quote! {
        #schema_static
        #item

        #[derive(Clone)]
        #[doc(hidden)]
        pub struct #impl_name {
            sink: vooya::EventSink,
        }

        impl #impl_name {
            pub fn new(sink: vooya::EventSink) -> Self {
                Self { sink }
            }
        }

        impl #trait_name for #impl_name {
            #(#method_bodies)*
        }
    }
}

fn split_receiver(args: Vec<&FnArg>) -> (Option<&FnArg>, Vec<&syn::PatType>) {
    let mut iter = args.into_iter();
    let receiver = iter
        .next()
        .filter(|arg| matches!(arg, FnArg::Receiver(_)));
    let params = iter
        .filter_map(|arg| match arg {
            FnArg::Typed(pat) => Some(pat),
            FnArg::Receiver(_) => None,
        })
        .collect();
    (receiver, params)
}

fn event_payload(params: &[&syn::PatType]) -> TokenStream {
    if params.is_empty() {
        return quote! { ::wasm_bindgen::JsValue::UNDEFINED };
    }
    if params.len() == 1 {
        let name = &params[0].pat;
        return quote! {
            <_ as vooya::ToJs>::to_js(&#name).expect("Vooya event payload encoding failed")
        };
    }
    let pushes = params.iter().map(|param| {
        let name = &param.pat;
        quote! {
            detail.push(&<_ as vooya::ToJs>::to_js(&#name).expect("Vooya event payload encoding failed"));
        }
    });
    quote! {
        let detail = ::js_sys::Array::new();
        #(#pushes)*
        let detail: ::wasm_bindgen::JsValue = detail.into();
        detail
    }
}

fn schema_json(item: &ItemTrait, impl_name: syn::Ident) -> String {
    let methods = item
        .items
        .iter()
        .filter_map(|item| match item {
            syn::TraitItem::Fn(method) => Some(method),
            _ => None,
        })
        .map(|method| {
            let name = method.sig.ident.to_string();
            let params = method
                .sig
                .inputs
                .iter()
                .filter_map(|arg| match arg {
                    FnArg::Typed(pat) => Some(pat),
                    FnArg::Receiver(_) => None,
                })
                .map(|param| {
                    format!(
                        r#"{{"name":{},"type":{}}}"#,
                        json_string(&ident_of(&param.pat)),
                        json_string(&type_string(&param.ty)),
                    )
                })
                .collect::<Vec<_>>()
                .join(",");
            format!(
                r#"{{"name":{},"params":[{}]}}"#,
                json_string(&name),
                params
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    format!(
        r#"{{"kind":"events","name":{},"impl":{},"methods":[{}]}}"#,
        json_string(&item.ident.to_string()),
        json_string(&impl_name.to_string()),
        methods
    )
}

fn ident_of(pat: &syn::Pat) -> String {
    match pat {
        syn::Pat::Ident(ident) => ident.ident.to_string(),
        _ => String::from("value"),
    }
}

fn type_string(ty: &Type) -> String {
    let mut rendered = quote!(#ty).to_string();
    if let Some(rest) = rendered.strip_prefix("::") {
        rendered = rest.to_string();
    }
    rendered
}
