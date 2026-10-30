//! Compile-time metadata for the owned ABI. It describes conversions, not Rust layouts.
//! Named references deliberately stop at identity; recursive graphs never recurse in const evaluation.

#[derive(Clone, Copy)]
pub enum AbiType {
    Scalar(&'static str),
    Named {
        identity: &'static str,
        direction: &'static str,
    },
    Option(&'static AbiType),
    Vec(&'static AbiType),
    Map(&'static AbiType),
    Tuple(&'static [AbiType]),
    Opaque,
    Unsupported(&'static str),
}

#[derive(Clone, Copy)]
pub enum Part {
    Json(&'static str),
    String(&'static str),
    Type(AbiType),
}

// N=0 counts bytes without allocating a buffer. The same encoder determines
// the static's exact length and fills it, including JSON escaping and UTF-8.
struct Encoder<const N: usize> {
    bytes: [u8; N],
    length: usize,
}
impl<const N: usize> Encoder<N> {
    const fn byte(&mut self, byte: u8) {
        if N != 0 {
            self.bytes[self.length] = byte;
        }
        self.length += 1;
    }
    const fn text(&mut self, text: &str) {
        let bytes = text.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            self.byte(bytes[i]);
            i += 1;
        }
    }
    const fn string(&mut self, text: &str) {
        self.byte(b'"');
        let bytes = text.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            let byte = bytes[i];
            if byte == b'"' || byte == b'\\' {
                self.byte(b'\\');
                self.byte(byte);
            } else if byte < 32 {
                self.text("\\u00");
                self.byte(b"0123456789abcdef"[(byte >> 4) as usize]);
                self.byte(b"0123456789abcdef"[(byte & 15) as usize]);
            } else {
                self.byte(byte);
            }
            i += 1;
        }
        self.byte(b'"');
    }
    const fn ty(&mut self, ty: AbiType) {
        match ty {
            AbiType::Scalar(name) => {
                self.text("{\"kind\":\"scalar\",\"name\":");
                self.string(name);
            }
            AbiType::Named {
                identity,
                direction,
            } => {
                self.text("{\"kind\":\"named\",\"identity\":");
                self.string(identity);
                self.text(",\"direction\":");
                self.string(direction);
            }
            AbiType::Option(inner) | AbiType::Vec(inner) | AbiType::Map(inner) => {
                self.text("{\"kind\":");
                self.string(match ty {
                    AbiType::Option(_) => "option",
                    AbiType::Vec(_) => "vec",
                    _ => "map",
                });
                self.text(",\"value\":");
                self.ty(*inner);
            }
            AbiType::Tuple(items) => {
                self.text("{\"kind\":\"tuple\",\"items\":[");
                let mut i = 0;
                while i < items.len() {
                    if i > 0 {
                        self.byte(b',');
                    }
                    self.ty(items[i]);
                    i += 1;
                }
                self.byte(b']');
            }
            AbiType::Opaque => self.text("{\"kind\":\"opaque\""),
            AbiType::Unsupported(reason) => {
                self.text("{\"kind\":\"unsupported\",\"reason\":");
                self.string(reason);
            }
        }
        self.byte(b'}');
    }
    const fn parts(&mut self, parts: &[Part]) {
        let mut i = 0;
        while i < parts.len() {
            match parts[i] {
                Part::Json(text) => self.text(text),
                Part::String(text) => self.string(text),
                Part::Type(ty) => self.ty(ty),
            }
            i += 1;
        }
        self.byte(b'\n');
    }
}

pub const fn encoded_len(parts: &[Part]) -> usize {
    let mut encoder = Encoder::<0> {
        bytes: [],
        length: 0,
    };
    encoder.parts(parts);
    encoder.length
}
pub const fn encode<const N: usize>(parts: &[Part]) -> [u8; N] {
    let mut encoder = Encoder {
        bytes: [0; N],
        length: 0,
    };
    encoder.parts(parts);
    assert!(encoder.length == N, "schema length mismatch");
    encoder.bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn const_encoder_preserves_strings_and_nested_types() {
        const PARTS: &[Part] = &[
            Part::Json("{\"label\":"),
            Part::String("引号\"\\\n"),
            Part::Json(",\"type\":"),
            Part::Type(AbiType::Option(&AbiType::Tuple(&[
                AbiType::Scalar("u32"),
                AbiType::Named {
                    identity: "app::models::Item",
                    direction: "to",
                },
            ]))),
            Part::Json("}"),
        ];
        const BYTES: [u8; encoded_len(PARTS)] = encode(PARTS);
        assert_eq!(std::str::from_utf8(&BYTES).unwrap(), "{\"label\":\"引号\\\"\\\\\\u000a\",\"type\":{\"kind\":\"option\",\"value\":{\"kind\":\"tuple\",\"items\":[{\"kind\":\"scalar\",\"name\":\"u32\"},{\"kind\":\"named\",\"identity\":\"app::models::Item\",\"direction\":\"to\"}]}}}\n");
    }
}
