// Reads Vooya schema records from the `__voo_schema` custom section of a
// wasm module without adding a dependency on a binary parser.
//
// Each macro emits one single-line JSON record into that section through
// `#[used]` byte-array statics. This reader scans the wasm binary's section
// table and returns the decoded records.

export interface VooSchemaRecord {
  kind: "props" | "type" | "events" | "component" | "store";
  name: string;
  [key: string]: unknown;
}

export const VOO_SCHEMA_SECTION = "__voo_schema";

export function readVooSchema(wasmBytes: Uint8Array): VooSchemaRecord[] {
  const view = new DataView(wasmBytes.buffer, wasmBytes.byteOffset, wasmBytes.byteLength);
  let offset = 0;

  if (wasmBytes.length < 8) {
    throw new Error("Vooya wasm module is too short to contain a header.");
  }
  const magic = String.fromCharCode(...wasmBytes.subarray(0, 4));
  if (magic !== "\0asm") {
    throw new Error("Vooya wasm module has an invalid magic header.");
  }
  offset = 8;

  const records: VooSchemaRecord[] = [];
  while (offset < wasmBytes.length) {
    const sectionId = wasmBytes[offset];
    offset += 1;
    const length = readVarUint32(view, offset);
    offset += varUint32Size(view, offset);
    const sectionEnd = offset + length;

    if (sectionId === 0) {
      const name = readString(view, offset);
      offset += varUint32Size(view, offset) + name.bytes.length;
      if (name.value === VOO_SCHEMA_SECTION) {
        const text = new TextDecoder().decode(wasmBytes.subarray(offset, sectionEnd));
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          const record = JSON.parse(line) as VooSchemaRecord;
          if (!record || typeof record.kind !== "string") continue;
          records.push(record);
        }
      }
    }
    offset = sectionEnd;
  }
  return records;
}

function readVarUint32(view: DataView, offset: number): number {
  let result = 0;
  let shift = 0;
  while (true) {
    const byte = view.getUint8(offset);
    offset += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 28) throw new Error("Vooya wasm varuint is too large.");
  }
  return result;
}

function varUint32Size(view: DataView, offset: number): number {
  let size = 0;
  while (true) {
    const byte = view.getUint8(offset + size);
    size += 1;
    if ((byte & 0x80) === 0) break;
  }
  return size;
}

function readString(view: DataView, offset: number): { value: string; bytes: Uint8Array } {
  const length = readVarUint32(view, offset);
  const start = offset + varUint32Size(view, offset);
  const bytes = new Uint8Array(view.buffer, view.byteOffset + start, length);
  return { value: new TextDecoder().decode(bytes), bytes };
}
