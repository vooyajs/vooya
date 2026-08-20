//! `#[voo::store]`: Rust-owned state and logic consumed through a typed hook.
//!
//! A state store is an `impl` block whose methods are marked with
//! `#[voo::action]` and a single `#[voo::snapshot]`. The macro re-emits the
//! block unchanged (minus the Vooya attributes) and generates a
//! `#[wasm_bindgen]` handle class exposing:
//!
//! - `new(props, notify)` — decode props, construct the store, wire
//!   notifications;
//! - `dispatch_<action>(...)` — one export per action, with `events` and
//!   `props` parameters injected rather than exported;
//! - `snapshot()` — identity-stable encoded snapshot for
//!   `useSyncExternalStore` / Vue composables;
//! - `subscribe(cb) -> u32` / `unsubscribe(id)` — change subscription with
//!   tokens, coalesced to one notification per action dispatch;
//! - `dispose()`.
//!
//! Notifications reuse the `#[voo::events]` declaration vocabulary but travel
//! through a JavaScript callback instead of a host `CustomEvent`.

use proc_macro2::TokenStream;
use quote::quote;
use syn::{FnArg, Ident, ImplItem, ImplItemFn, ItemImpl, Pat, ReturnType, Type};

use crate::schema::{emit_schema, json_string};

pub fn expand_store(args: TokenStream, input: TokenStream) -> TokenStream {
    if !args.is_empty() {
        return syn::Error::new(
            proc_macro2::Span::call_site(),
            "#[voo::store] takes no arguments",
        )
        .to_compile_error();
    }
    let item: ItemImpl = match syn::parse2(input) {
        Ok(item) => item,
        Err(error) => return error.to_compile_error(),
    };
    expand(item)
}

struct ActionInfo {
    method_name: Ident,
    export_name: Ident,
    params: Vec<TokenStream>,
    call_args: Vec<TokenStream>,
    export_ret: TokenStream,
    needs_events: bool,
    needs_props: bool,
    is_encoded: bool,
    is_plain_result_unit: bool,
}

fn expand(item: ItemImpl) -> TokenStream {
    let store_type: Type = (*item.self_ty).clone();
    let Some(store_ident) = type_ident(&store_type) else {
        return syn::Error::new_spanned(
            &store_type,
            "#[voo::store] requires a bare `impl StoreType { ... }` block",
        )
        .to_compile_error();
    };
    let store_name = store_ident.to_string();
    let handle_ident = Ident::new(&format!("Vooya{store_name}Store"), store_ident.span());

    let mut constructor: Option<ImplItemFn> = None;
    let mut snapshot: Option<ImplItemFn> = None;
    let mut actions: Vec<ImplItemFn> = Vec::new();
    let mut cleaned: Vec<ImplItem> = Vec::new();

    for impl_item in item.items {
        match impl_item {
            ImplItem::Fn(method) => {
                if has_attr(&method, "action") {
                    actions.push(method.clone());
                    cleaned.push(ImplItem::Fn(clean_method(method)));
                    continue;
                }
                if has_attr(&method, "snapshot") {
                    snapshot = Some(method.clone());
                    cleaned.push(ImplItem::Fn(clean_method(method)));
                    continue;
                }
                if method.sig.ident == "new" {
                    constructor = Some(method.clone());
                }
                cleaned.push(ImplItem::Fn(method));
            }
            other => cleaned.push(other),
        }
    }

    let Some(constructor) = constructor else {
        return syn::Error::new_spanned(
            &store_ident,
            "Vooya stores require a `fn new(props: &Props) -> Self` constructor",
        )
        .to_compile_error();
    };
    let Some(props_ty) = constructor_props_type(&constructor) else {
        return syn::Error::new_spanned(
            &constructor.sig,
            "Vooya store constructor must be `fn new(props: &Props) -> Self`",
        )
        .to_compile_error();
    };
    let Some(snapshot) = snapshot else {
        return syn::Error::new_spanned(
            &store_ident,
            "Vooya stores require exactly one #[voo::snapshot] method returning the snapshot type",
        )
        .to_compile_error();
    };
    let Some(snapshot_ty) = snapshot_return_type(&snapshot) else {
        return syn::Error::new_spanned(
            &snapshot.sig,
            "Vooya snapshot method must return a concrete snapshot type",
        )
        .to_compile_error();
    };

    let props_ident_for_injection = props_ident(&props_ty);
    let events_ident = actions
        .iter()
        .find_map(|action| find_injected_type(action, "events"))
        .and_then(|ty| type_ident(ty));
    let dispatcher_ident = events_ident
        .as_ref()
        .map(|ident| Ident::new(&format!("{ident}Impl"), ident.span()));

    let mut info_actions: Vec<ActionInfo> = Vec::new();
    let mut schema_actions: Vec<String> = Vec::new();
    for method in &actions {
        schema_actions.push(action_schema(
            method,
            &props_ident_for_injection,
            events_ident.as_ref(),
        ));
        info_actions.push(build_action(
            method,
            &props_ident_for_injection,
            events_ident.as_ref(),
        ));
    }

    let schema_json = format!(
        r#"{{"kind":"store","name":{},"props":{},"events":{},"snapshot":{},"export":{},"actions":[{}]}}"#,
        json_string(&store_name),
        json_string(&type_string(&props_ty)),
        json_string(
            &events_ident
                .as_ref()
                .map(|ident| ident.to_string())
                .unwrap_or_default()
        ),
        json_string(&type_string(&snapshot_ty)),
        json_string(&handle_ident.to_string()),
        schema_actions.join(","),
    );
    let schema_static = emit_schema("store", &store_name, &schema_json);

    let cleaned_impl = quote! { impl #store_type { #(#cleaned)* } };
    let generated = generate_handle(
        &store_ident,
        &handle_ident,
        &props_ty,
        &snapshot_ty,
        events_ident.as_ref(),
        dispatcher_ident.as_ref(),
        &info_actions,
        snapshot,
    );

    quote! {
        #schema_static
        #cleaned_impl
        #generated
    }
}

fn generate_handle(
    store_ident: &Ident,
    handle_ident: &Ident,
    props_ty: &Type,
    snapshot_ty: &Type,
    _events_ident: Option<&Ident>,
    dispatcher_ident: Option<&Ident>,
    actions: &[ActionInfo],
    snapshot: ImplItemFn,
) -> TokenStream {
    let events_field = quote! {
        let events = vooya::EventSink::new(vooya::dispatch_notify(notify));
    };

    let snapshot_fn_name = snapshot.sig.ident.clone();

    let action_exports = actions.iter().map(|action| {
        let name = &action.export_name;
        let method_name = &action.method_name;
        let params = &action.params;
        let ret = &action.export_ret;
        let call_args = &action.call_args;
        let needs_events = action.needs_events;
        let needs_props = action.needs_props;

        let injected = match (needs_events, needs_props) {
            (true, true) => quote! {
                let _events = #dispatcher_ident::new(self.runtime.events().clone());
                let _props = self.runtime.props();
            },
            (true, false) => quote! {
                let _events = #dispatcher_ident::new(self.runtime.events().clone());
            },
            (false, true) => quote! {
                let _props = self.runtime.props();
            },
            (false, false) => quote! {},
        };

        let body = if action.is_encoded {
            quote! {
                let result = self.runtime.dispatch(|state| {
                    #injected
                    state.#method_name(#(#call_args),*)
                });
                match result {
                    ::core::result::Result::Ok(value) => vooya::ToJs::to_js(&value),
                    ::core::result::Result::Err(error) => ::core::result::Result::Err(error),
                }
            }
        } else if action.is_plain_result_unit {
            quote! {
                self.runtime.dispatch(|state| {
                    #injected
                    state.#method_name(#(#call_args),*)
                })
            }
        } else {
            quote! {
                let value = self.runtime.dispatch(|state| {
                    #injected
                    state.#method_name(#(#call_args),*)
                });
                vooya::ToJs::to_js(&value)
            }
        };

        quote! {
            pub fn #name(&self, #(#params),*) -> #ret {
                #body
            }
        }
    });

    quote! {
        #[::wasm_bindgen::prelude::wasm_bindgen]
        #[doc(hidden)]
        pub struct #handle_ident {
            runtime: vooya::StoreRuntime<#store_ident, #props_ty, #snapshot_ty>,
        }

        #[::wasm_bindgen::prelude::wasm_bindgen]
        impl #handle_ident {
            #[::wasm_bindgen::prelude::wasm_bindgen(constructor)]
            pub fn new(
                props_value: ::wasm_bindgen::JsValue,
                notify: ::js_sys::Function,
            ) -> Result<#handle_ident, ::wasm_bindgen::JsValue> {
                let props = <#props_ty as vooya::FromJs>::from_js(&props_value)?;
                #events_field
                let state = #store_ident::new(&props);
                let snapshot_fn: ::std::rc::Rc<dyn ::core::ops::Fn(&#store_ident) -> #snapshot_ty> =
                    ::std::rc::Rc::new(|state| state.#snapshot_fn_name());
                ::core::result::Result::Ok(#handle_ident {
                    runtime: vooya::StoreRuntime::new(state, props, events, snapshot_fn),
                })
            }

            #(#action_exports)*

            pub fn snapshot(&self) -> ::wasm_bindgen::JsValue {
                self.runtime.snapshot_js()
            }

            pub fn subscribe(&self, callback: ::js_sys::Function) -> u32 {
                self.runtime.subscribe(callback)
            }

            pub fn unsubscribe(&self, id: u32) {
                self.runtime.unsubscribe(id);
            }

            pub fn dispose(&self) {
                self.runtime.dispose();
            }
        }
    }
}

fn build_action(
    method: &ImplItemFn,
    props_ident_for_injection: &Ident,
    events_ident: Option<&Ident>,
) -> ActionInfo {
    let method_name = &method.sig.ident;
    let export_name = Ident::new(&format!("dispatch_{method_name}"), method_name.span());
    let method_name = method_name.clone();

    let mut params: Vec<TokenStream> = Vec::new();
    let mut call_args: Vec<TokenStream> = Vec::new();
    let mut needs_events = false;
    let mut needs_props = false;

    for arg in method.sig.inputs.iter().skip(1) {
        let FnArg::Typed(pat_ty) = arg else { continue };
        let name = match &*pat_ty.pat {
            Pat::Ident(ident) => ident.ident.to_string(),
            _ => continue,
        };
        if name == "events" && is_ref_to(&pat_ty.ty, events_ident) {
            needs_events = true;
            call_args.push(quote! { &_events });
            continue;
        }
        if name == "props" && is_ref_to(&pat_ty.ty, Some(props_ident_for_injection)) {
            needs_props = true;
            call_args.push(quote! { &_props });
            continue;
        }
        let ty = &pat_ty.ty;
        let pat = &pat_ty.pat;
        params.push(quote! { #pat: #ty });
        call_args.push(quote! { #pat });
    }

    let (export_ret, is_encoded, is_plain_result_unit) = action_return_type(&method.sig.output);
    ActionInfo {
        method_name,
        export_name,
        params,
        call_args,
        export_ret,
        needs_events,
        needs_props,
        is_encoded,
        is_plain_result_unit,
    }
}

fn action_return_type(output: &ReturnType) -> (TokenStream, bool, bool) {
    let ReturnType::Type(_, ty) = output else {
        return (
            quote! { ::wasm_bindgen::JsValue },
            false,
            false,
        );
    };
    let Type::Path(path) = &**ty else {
        return (
            quote! { ::wasm_bindgen::JsValue },
            false,
            false,
        );
    };
    let is_result = path
        .path
        .segments
        .first()
        .is_some_and(|segment| segment.ident == "Result");
    if is_result {
        if let syn::PathArguments::AngleBracketed(args) = &path.path.segments[0].arguments {
            let mut it = args.args.iter();
            if let Some(syn::GenericArgument::Type(ok_ty)) = it.next() {
                let ok = quote!(#ok_ty).to_string();
                if ok == "()" {
                    return (
                        quote! { ::core::result::Result<(), ::wasm_bindgen::JsValue> },
                        false,
                        true,
                    );
                }
                return (
                    quote! { ::core::result::Result<::wasm_bindgen::JsValue, ::wasm_bindgen::JsValue> },
                    true,
                    false,
                );
            }
        }
    }
    (
        quote! { ::wasm_bindgen::JsValue },
        true,
        false,
    )
}

fn action_schema(
    method: &ImplItemFn,
    props_ident_for_injection: &Ident,
    events_ident: Option<&Ident>,
) -> String {
    let params = method
        .sig
        .inputs
        .iter()
        .skip(1)
        .filter_map(|arg| match arg {
            FnArg::Typed(pat_ty) => {
                let name = match &*pat_ty.pat {
                    Pat::Ident(ident) => ident.ident.to_string(),
                    _ => String::from("value"),
                };
                if name == "events" && is_ref_to(&pat_ty.ty, events_ident) {
                    None
                } else if name == "props" && is_ref_to(&pat_ty.ty, Some(props_ident_for_injection)) {
                    None
                } else {
                    Some(format!(
                        r#"{{"name":{},"type":{}}}"#,
                        json_string(&name),
                        json_string(&type_string(&pat_ty.ty)),
                    ))
                }
            }
            FnArg::Receiver(_) => None,
        })
        .collect::<Vec<_>>()
        .join(",");
    format!(
        r#"{{"name":{},"params":[{}]}}"#,
        json_string(&method.sig.ident.to_string()),
        params
    )
}

fn constructor_props_type(constructor: &ImplItemFn) -> Option<Type> {
    let mut params = constructor
        .sig
        .inputs
        .iter()
        .filter_map(|arg| match arg {
            FnArg::Typed(pat_ty) => Some(pat_ty),
            FnArg::Receiver(_) => None,
        });
    let param = params.next()?;
    if params.next().is_some() {
        return None;
    }
    let Type::Reference(reference) = &*param.ty else {
        return None;
    };
    let Type::Path(path) = &*reference.elem else {
        return None;
    };
    Some(path_to_type(&path.path))
}

fn snapshot_return_type(snapshot: &ImplItemFn) -> Option<Type> {
    match &snapshot.sig.output {
        ReturnType::Default => None,
        ReturnType::Type(_, ty) => {
            let Type::Path(path) = &**ty else { return None };
            Some(path_to_type(&path.path))
        }
    }
}

fn path_to_type(path: &syn::Path) -> Type {
    Type::Path(syn::TypePath {
        qself: None,
        path: path.clone(),
    })
}

fn find_injected_type<'a>(method: &'a ImplItemFn, name: &str) -> Option<&'a Type> {
    method.sig.inputs.iter().find_map(|arg| {
        let FnArg::Typed(pat_ty) = arg else {
            return None;
        };
        let pat_name = match &*pat_ty.pat {
            Pat::Ident(ident) => ident.ident.to_string(),
            _ => return None,
        };
        if pat_name == name {
            let Type::Reference(reference) = &*pat_ty.ty else {
                return None;
            };
            Some(&*reference.elem)
        } else {
            None
        }
    })
}

fn is_ref_to(ty: &Type, expected: Option<&Ident>) -> bool {
    let Some(expected) = expected else {
        return false;
    };
    let Type::Reference(reference) = ty else {
        return false;
    };
    type_ident(&reference.elem)
        .map(|ident| ident == *expected)
        .unwrap_or(false)
}

fn type_ident(ty: &Type) -> Option<Ident> {
    match ty {
        Type::Path(path) => path.path.segments.last().map(|segment| segment.ident.clone()),
        Type::TraitObject(trait_object) => trait_object.bounds.iter().find_map(|bound| {
            match bound {
                syn::TypeParamBound::Trait(bound) => {
                    bound.path.segments.last().map(|segment| segment.ident.clone())
                }
                _ => None,
            }
        }),
        _ => None,
    }
}

fn props_ident(ty: &Type) -> Ident {
    type_ident(ty).unwrap_or_else(|| Ident::new("Props", proc_macro2::Span::call_site()))
}

fn type_string(ty: &Type) -> String {
    let mut rendered = quote!(#ty).to_string();
    if let Some(rest) = rendered.strip_prefix("::") {
        rendered = rest.to_string();
    }
    rendered
}

fn has_attr(method: &ImplItemFn, name: &str) -> bool {
    method.attrs.iter().any(|attr| {
        attr.path()
            .segments
            .last()
            .is_some_and(|segment| segment.ident == name)
    })
}

fn clean_method(mut method: ImplItemFn) -> ImplItemFn {
    method.attrs.retain(|attr| {
        let last = attr.path().segments.last();
        !last.is_some_and(|segment| segment.ident == "action")
            && !last.is_some_and(|segment| segment.ident == "snapshot")
    });
    method
}
