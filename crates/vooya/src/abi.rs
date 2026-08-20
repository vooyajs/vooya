//! The owned, JSON-like portion of Vooya's public WASM ABI.

use std::collections::{BTreeMap, HashMap};

use js_sys::{Array, BigInt, Object, Reflect};
use wasm_bindgen::{JsCast, JsValue};

/// Decodes one owned Rust value from the public JavaScript ABI.
pub trait FromJs: Sized {
    fn from_js(value: &JsValue) -> Result<Self, JsValue>;
}

/// Encodes one owned Rust value for the public JavaScript ABI.
pub trait ToJs {
    fn to_js(&self) -> Result<JsValue, JsValue>;
}

#[doc(hidden)]
pub fn abi_error(message: impl AsRef<str>) -> JsValue {
    JsValue::from_str(&format!("Vooya ABI error: {}", message.as_ref()))
}

impl FromJs for bool {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        value.as_bool().ok_or_else(|| abi_error("expected boolean"))
    }
}

impl ToJs for bool {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_bool(*self))
    }
}

impl FromJs for String {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        value
            .as_string()
            .ok_or_else(|| abi_error("expected string"))
    }
}

impl ToJs for String {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_str(self))
    }
}

impl ToJs for &str {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_str(self))
    }
}

impl FromJs for f64 {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        value.as_f64().ok_or_else(|| abi_error("expected number"))
    }
}

impl ToJs for f64 {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_f64(*self))
    }
}

impl FromJs for f32 {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        let number = f64::from_js(value)?;
        if number.is_finite() && (number < f32::MIN as f64 || number > f32::MAX as f64) {
            return Err(abi_error("number is outside f32 range"));
        }
        Ok(number as f32)
    }
}

impl ToJs for f32 {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        Ok(JsValue::from_f64(*self as f64))
    }
}

macro_rules! number_integer {
    ($($type:ty),+ $(,)?) => {$(
        impl FromJs for $type {
            fn from_js(value: &JsValue) -> Result<Self, JsValue> {
                let number = value.as_f64().ok_or_else(|| abi_error("expected number"))?;
                if !number.is_finite() || number.fract() != 0.0 {
                    return Err(abi_error("expected a finite integer"));
                }
                if number < <$type>::MIN as f64 || number > <$type>::MAX as f64 {
                    return Err(abi_error(concat!("number is outside ", stringify!($type), " range")));
                }
                Ok(number as $type)
            }
        }

        impl ToJs for $type {
            fn to_js(&self) -> Result<JsValue, JsValue> {
                Ok(JsValue::from_f64(*self as f64))
            }
        }
    )+};
}

number_integer!(i8, u8, i16, u16, i32, u32, isize, usize);

macro_rules! bigint_integer {
    ($($type:ty),+ $(,)?) => {$(
        impl FromJs for $type {
            fn from_js(value: &JsValue) -> Result<Self, JsValue> {
                if !value.is_bigint() {
                    return Err(abi_error(concat!("expected bigint for ", stringify!($type))));
                }
                let integer = BigInt::new(value).map_err(|_| abi_error("invalid bigint"))?;
                let text = integer
                    .to_string(10)
                    .map_err(|_| abi_error("could not render bigint"))?
                    .as_string()
                    .ok_or_else(|| abi_error("could not read bigint"))?;
                text.parse::<$type>()
                    .map_err(|_| abi_error(concat!("bigint is outside ", stringify!($type), " range")))
            }
        }

        impl ToJs for $type {
            fn to_js(&self) -> Result<JsValue, JsValue> {
                BigInt::new(&JsValue::from_str(&self.to_string()))
                    .map(JsValue::from)
                    .map_err(|_| abi_error("could not encode bigint"))
            }
        }
    )+};
}

bigint_integer!(i64, u64, i128, u128);

impl<T: FromJs> FromJs for Option<T> {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        if value.is_null_or_undefined() {
            Ok(None)
        } else {
            T::from_js(value).map(Some)
        }
    }
}

impl<T: ToJs> ToJs for Option<T> {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        self.as_ref().map_or(Ok(JsValue::NULL), ToJs::to_js)
    }
}

impl<T: FromJs> FromJs for Vec<T> {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        if !Array::is_array(value) {
            return Err(abi_error("expected array"));
        }
        Array::from(value)
            .iter()
            .enumerate()
            .map(|(index, item)| {
                T::from_js(&item).map_err(|_| abi_error(format!("invalid array item {index}")))
            })
            .collect()
    }
}

impl<T: ToJs> ToJs for Vec<T> {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        let array = Array::new();
        for item in self {
            array.push(&item.to_js()?);
        }
        Ok(array.into())
    }
}

impl<T: FromJs> FromJs for BTreeMap<String, T> {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        object_entries(value)?
            .into_iter()
            .map(|(key, value)| T::from_js(&value).map(|value| (key, value)))
            .collect()
    }
}

impl<T: ToJs> ToJs for BTreeMap<String, T> {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        encode_map(self.iter().map(|(key, value)| (key.as_str(), value)))
    }
}

impl<T: FromJs> FromJs for HashMap<String, T> {
    fn from_js(value: &JsValue) -> Result<Self, JsValue> {
        object_entries(value)?
            .into_iter()
            .map(|(key, value)| T::from_js(&value).map(|value| (key, value)))
            .collect()
    }
}

impl<T: ToJs> ToJs for HashMap<String, T> {
    fn to_js(&self) -> Result<JsValue, JsValue> {
        encode_map(self.iter().map(|(key, value)| (key.as_str(), value)))
    }
}

fn object_entries(value: &JsValue) -> Result<Vec<(String, JsValue)>, JsValue> {
    if !value.is_object() || Array::is_array(value) || value.is_null() {
        return Err(abi_error("expected object with string keys"));
    }
    let object: Object = value.clone().unchecked_into();
    Object::keys(&object)
        .iter()
        .map(|key| {
            let name = key
                .as_string()
                .ok_or_else(|| abi_error("object key is not a string"))?;
            let value =
                Reflect::get(value, &key).map_err(|_| abi_error("could not read object field"))?;
            Ok((name, value))
        })
        .collect()
}

fn encode_map<'a, T: ToJs + 'a>(
    entries: impl Iterator<Item = (&'a str, &'a T)>,
) -> Result<JsValue, JsValue> {
    let object = Object::new();
    for (key, value) in entries {
        Reflect::set(&object, &JsValue::from_str(key), &value.to_js()?)
            .map_err(|_| abi_error("could not write object field"))?;
    }
    Ok(object.into())
}

macro_rules! tuple {
    ($($name:ident : $index:tt),+ $(,)?) => {
        impl<$($name: FromJs),+> FromJs for ($($name,)+) {
            fn from_js(value: &JsValue) -> Result<Self, JsValue> {
                if !Array::is_array(value) { return Err(abi_error("expected tuple array")); }
                let array = Array::from(value);
                if array.length() != tuple!(@count $($name)+) { return Err(abi_error("tuple has the wrong length")); }
                Ok(($($name::from_js(&array.get($index))?,)+))
            }
        }
        impl<$($name: ToJs),+> ToJs for ($($name,)+) {
            fn to_js(&self) -> Result<JsValue, JsValue> {
                let array = Array::new();
                $(array.push(&self.$index.to_js()?);)+
                Ok(array.into())
            }
        }
    };
    (@count $($name:ident)+) => { <[()]>::len(&[$(tuple!(@one $name)),+]) as u32 };
    (@one $name:ident) => { () };
}

tuple!(A: 0, B: 1);
tuple!(A: 0, B: 1, C: 2);
tuple!(A: 0, B: 1, C: 2, D: 3);
