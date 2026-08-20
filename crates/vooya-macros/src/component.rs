//! `#[voo::component]`: turns a Rust function into a mountable DOM component.
//!
//! A component function has the shape
//!
//! ```rust,ignore
//! #[voo::component]
//! pub fn Counter(ctx: vooya::Context<Props, Events>) -> Result<vooya::ViewElement, JsValue>
//! ```
//!
//! The macro re-emits the function unchanged and generates a
//! `#[wasm_bindgen]` handle class exposing `mount`, `update(key, value)` and
//! `dispose`. `update` is key-dispatched through `PropSink`, so the wrapper
//! never needs the prop field names. A schema record ties the component to its
//! props and events records by name.

use proc_macro2::TokenStream;
use quote::quote;
use syn::{FnArg, Ident, ItemFn, Type};

use crate::schema::{emit_schema, json_string};

pub fn expand_component(args: TokenStream, input: TokenStream) -> TokenStream {
    let meta: ComponentMeta = match syn::parse2(args) {
        Ok(meta) => meta,
        Err(error) => return error.to_compile_error(),
    };
    let item: ItemFn = match syn::parse2(input) {
        Ok(item) => item,
        Err(error) => return error.to_compile_error(),
    };
    expand(item, meta)
}

pub struct ComponentMeta {
    pub style: Option<String>,
}

impl syn::parse::Parse for ComponentMeta {
    fn parse(input: syn::parse::ParseStream) -> syn::Result<Self> {
        let mut style = None;
        if input.is_empty() {
            return Ok(ComponentMeta { style });
        }
        let metas = syn::punctuated::Punctuated::<syn::Meta, syn::Token![,]>::parse_terminated(input)?;
        for meta in metas {
            match &meta {
                syn::Meta::NameValue(name_value) if name_value.path.is_ident("style") => {
                    if let syn::Expr::Lit(expr_lit) = &name_value.value {
                        if let syn::Lit::Str(value) = &expr_lit.lit {
                            style = Some(value.value());
                            continue;
                        }
                    }
                }
                _ => {}
            }
            return Err(syn::Error::new_spanned(
                meta,
                "unsupported #[voo::component] attribute",
            ));
        }
        Ok(ComponentMeta { style })
    }
}

fn expand(item: ItemFn, meta: ComponentMeta) -> TokenStream {
    let fn_name = &item.sig.ident;
    let handle_name = Ident::new(&format!("Vooya{fn_name}Handle"), fn_name.span());

    let Some(ctx_param) = find_context_param(&item) else {
        return syn::Error::new_spanned(
            &item.sig,
            "Vooya component functions must take a `ctx: vooya::Context<Props, Events>` parameter",
        )
        .to_compile_error();
    };
    let (props_ty, events_ty) = match context_type_args(&ctx_param.ty) {
        Some(types) => types,
        None => {
            return syn::Error::new_spanned(
                &ctx_param.ty,
                "Vooya component context must be vooya::Context<Props, Events>",
            )
            .to_compile_error();
        }
    };
    let events_trait_ident = type_ident(&events_ty);
    let dispatcher_ident = Ident::new(
        &format!("{events_trait_ident}Impl"),
        events_trait_ident.span(),
    );

    let style_json = meta
        .style
        .as_ref()
        .map(|style| json_string(style))
        .unwrap_or_else(|| String::from("null"));
    let schema_json = format!(
        r#"{{"kind":"component","name":{},"props":{},"events":{},"style":{},"export":{}}}"#,
        json_string(&fn_name.to_string()),
        json_string(&type_string(&props_ty)),
        json_string(&type_string(&events_ty)),
        style_json,
        json_string(&handle_name.to_string()),
    );
    let schema_static = emit_schema("component", &fn_name.to_string(), &schema_json);

    quote! {
        #schema_static
        #item

        #[::wasm_bindgen::prelude::wasm_bindgen]
        #[doc(hidden)]
        pub struct #handle_name {
            view: vooya::ViewElement,
            props: vooya::Signal<#props_ty>,
            _events: #dispatcher_ident,
        }

        #[::wasm_bindgen::prelude::wasm_bindgen]
        impl #handle_name {
            #[::wasm_bindgen::prelude::wasm_bindgen(constructor)]
            pub fn new(
                host: &::web_sys::Element,
                props_value: &::wasm_bindgen::JsValue,
            ) -> Result<#handle_name, ::wasm_bindgen::JsValue> {
                let props = <#props_ty as vooya::FromJs>::from_js(props_value)?;
                let props_signal = vooya::signal(props.clone());
                let events = #dispatcher_ident::new(
                    vooya::EventSink::new(vooya::dispatch_custom_event(host.clone())),
                );
                let view = #fn_name(vooya::Context {
                    host: host.clone(),
                    props,
                    events: Box::new(events.clone()),
                })?;
                view.mount(host)?;
                Ok(#handle_name {
                    view,
                    props: props_signal,
                    _events: events,
                })
            }

            pub fn update(
                &mut self,
                key: &str,
                value: ::wasm_bindgen::JsValue,
            ) -> Result<(), ::wasm_bindgen::JsValue> {
                let mut props = self.props.get();
                <#props_ty as vooya::PropSink>::set(&mut props, key, value)?;
                self.props.set(props);
                Ok(())
            }

            pub fn dispose(&mut self) {
                self.view.remove();
            }
        }
    }
}

fn find_context_param(item: &ItemFn) -> Option<&syn::PatType> {
    item.sig.inputs.iter().find_map(|arg| match arg {
        FnArg::Typed(pat) => Some(pat),
        FnArg::Receiver(_) => None,
    })
}

/// Extracts the two generic arguments of `Context<P, E>` from the parameter
/// type, normalizing a possible `dyn` before the events trait.
fn context_type_args(ty: &Type) -> Option<(Type, Type)> {
    let Type::Path(path) = ty else { return None };
    let segment = path.path.segments.last()?;
    if segment.ident != "Context" {
        return None;
    }
    let syn::PathArguments::AngleBracketed(args) = &segment.arguments else {
        return None;
    };
    let mut args = args.args.iter().filter_map(|arg| match arg {
        syn::GenericArgument::Type(ty) => Some(ty.clone()),
        _ => None,
    });
    let props = args.next()?;
    let events = args.next()?;
    Some((props, events))
}

fn type_ident(ty: &Type) -> Ident {
    match ty {
        Type::Path(path) => path
            .path
            .segments
            .last()
            .map(|segment| segment.ident.clone())
            .unwrap_or_else(|| Ident::new("Events", proc_macro2::Span::call_site())),
        Type::TraitObject(trait_object) => trait_object
            .bounds
            .iter()
            .find_map(|bound| match bound {
                syn::TypeParamBound::Trait(bound) => bound
                    .path
                    .segments
                    .last()
                    .map(|segment| segment.ident.clone()),
                _ => None,
            })
            .unwrap_or_else(|| Ident::new("Events", proc_macro2::Span::call_site())),
        _ => Ident::new("Events", proc_macro2::Span::call_site()),
    }
}

fn type_string(ty: &Type) -> String {
    let mut rendered = quote!(#ty).to_string();
    if let Some(rest) = rendered.strip_prefix("::") {
        rendered = rest.to_string();
    }
    rendered
}
