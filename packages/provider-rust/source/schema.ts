/**
 * Build-time reader for the versioned `__voo_schema` WASM custom section.
 *
 * This parser intentionally has no dependency on a WASM runtime.  Schema is
 * build metadata, so malformed binaries must fail before a browser is
 * started and with an actionable offset/record diagnostic.
 */

export const VOO_SCHEMA_SECTION = "__voo_schema";
export const VOO_SCHEMA_VERSION = 2;

/** Compiler-resolved conversion graph. Identities are scoped to one artifact. */
export type RustAbiType =
  | { kind: "scalar"; name: string }
  | { kind: "named"; identity: string; direction: "from" | "to" }
  | { kind: "option" | "vec" | "map"; value: RustAbiType }
  | { kind: "tuple"; items: RustAbiType[] }
  | { kind: "opaque" }
  | { kind: "unsupported"; reason: string };

/** Optional source metadata added to schema v1; older producers omit it. */
export interface RustSchemaSource {
  file: string;
  line?: number;
  column?: number;
}

export interface RustSchemaParameter {
  name: string;
  type: string;
  abi?: RustAbiType;
  source?: RustSchemaSource;
}

export interface RustSchemaField extends RustSchemaParameter {}

export interface RustPropsSchema {
  version: number;
  kind: "props";
  id: string;
  name: string;
  group?: string | null;
  fields: RustSchemaField[];
}

export interface RustEventsSchema {
  version: number;
  kind: "events";
  id: string;
  name: string;
  group?: string | null;
  methods: Array<{ name: string; params: RustSchemaParameter[] }>;
}

export interface RustComponentSchema {
  version: number;
  kind: "component";
  id: string;
  name: string;
  group?: string | null;
  params: RustSchemaParameter[];
  return?: string;
  styles?: RustStyleDependency[];
  /** Optional opt-in component update mode. `in-place` preserves the mounted root. */
  update?: "in-place" | null;
}

export interface RustStyleDependency {
  path: string;
  scoped: boolean;
}

export interface RustStoreSchema {
  version: number;
  kind: "store";
  id: string;
  name: string;
  group?: string | null;
  actions: Array<{ name: string; params: RustSchemaParameter[] }>;
  snapshot?: string | null;
  snapshotSource?: RustSchemaSource;
  snapshotAbi?: RustAbiType;
}

export interface RustTypeSchema {
  version: number;
  kind: "type";
  id: string;
  name: string;
  group?: string | null;
  direction: "from" | "to";
  identity?: string;
  shape: { kind: "struct"; fields: RustSchemaField[] } | { kind: "enum"; variants: string[] };
}

export type RustSchemaRecord =
  | RustPropsSchema
  | RustEventsSchema
  | RustComponentSchema
  | RustStoreSchema
  | RustTypeSchema;

export interface RustSchemaDocument {
  version: 1 | typeof VOO_SCHEMA_VERSION;
  records: RustSchemaRecord[];
}

export interface RustSchemaIndex {
  components: RustComponentSchema[];
  props: RustPropsSchema[];
  events: RustEventsSchema[];
  stores: RustStoreSchema[];
  types: RustTypeSchema[];
  byId: ReadonlyMap<string, RustSchemaRecord>;
}

export interface RustComponentContract {
  component: RustComponentSchema;
  props?: RustPropsSchema;
  events?: RustEventsSchema;
}

export class RustSchemaError extends Error {
  constructor(message: string) {
    super(`Invalid Vooya schema: ${message}`);
    this.name = "RustSchemaError";
  }
}

export function readVooyaSchema(bytes: Uint8Array): RustSchemaDocument {
  if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    throw new RustSchemaError("WASM header is missing or invalid.");
  }
  if (bytes[4] !== 1 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0) {
    throw new RustSchemaError("unsupported WASM binary version; expected version 1.");
  }

  const records: RustSchemaRecord[] = [];
  const seen = new Set<string>();
  const conversions = new Set<string>();
  let offset = 8;
  while (offset < bytes.length) {
    const sectionOffset = offset;
    const sectionId = bytes[offset++];
    const length = readVarUint32(bytes, offset, sectionOffset);
    offset = length.next;
    const end = offset + length.value;
    if (end > bytes.length) {
      throw new RustSchemaError(`section at byte ${sectionOffset} extends beyond the binary.`);
    }

    if (sectionId === 0) {
      const custom = readCustomSection(bytes.subarray(offset, end), sectionOffset);
      if (custom.name === VOO_SCHEMA_SECTION) {
        for (const record of parseRecords(custom.data, sectionOffset)) {
          if (record.version !== 1 && record.version !== VOO_SCHEMA_VERSION) {
            throw new RustSchemaError(
              `schema record ${record.kind}:${record.id} uses version ${record.version}; expected 1 or ${VOO_SCHEMA_VERSION}.`,
            );
          }
          const key = `${record.kind}:${record.id}`;
          if (seen.has(key)) throw new RustSchemaError(`duplicate schema record ${key}.`);
          seen.add(key);
          if (record.kind === "type" && record.version === 2) {
            const conversion = JSON.stringify([record.identity, record.direction]);
            if (conversions.has(conversion)) throw new RustSchemaError(`duplicate schema record for conversion ${conversion}.`);
            conversions.add(conversion);
          }
          records.push(record);
        }
      }
    }
    offset = end;
  }

  return { version: records.some(record => record.version === 2) ? 2 : 1, records };
}

/** Groups records for declaration and adapter generation without guessing
 * relationships between independently authored Rust items. */
export function indexVooyaSchema(document: RustSchemaDocument): RustSchemaIndex {
  const byId = new Map<string, RustSchemaRecord>();
  for (const record of document.records) byId.set(record.id, record);
  return {
    components: document.records.filter((record): record is RustComponentSchema => record.kind === "component"),
    props: document.records.filter((record): record is RustPropsSchema => record.kind === "props"),
    events: document.records.filter((record): record is RustEventsSchema => record.kind === "events"),
    stores: document.records.filter((record): record is RustStoreSchema => record.kind === "store"),
    types: document.records.filter((record): record is RustTypeSchema => record.kind === "type"),
    byId,
  };
}

export function validateVooyaSchemaGroups(index: RustSchemaIndex): void {
  const grouped = new Map<string, RustSchemaRecord[]>();
  for (const record of [...index.components, ...index.props, ...index.events]) {
    if (!record.group) continue;
    const records = grouped.get(record.group) ?? [];
    records.push(record);
    grouped.set(record.group, records);
  }
  for (const [group, records] of grouped) {
    for (const kind of ["component", "props", "events"] as const) {
      if (records.filter((record) => record.kind === kind).length > 1) {
        throw new RustSchemaError(`group "${group}" contains multiple ${kind} records.`);
      }
    }
  }
}

/** Resolves a Rust type reference such as `CartProps` or `cart::CartProps` to
 * a schema record. Ambiguous short names are rejected instead of silently
 * selecting an unrelated module's record. */
export function resolveVooyaSchemaReference(
  index: RustSchemaIndex,
  reference: string,
  kind: RustSchemaRecord["kind"],
): RustSchemaRecord | undefined {
  const exact = index.byId.get(reference);
  if (exact?.kind === kind) return exact;
  const short = reference.split("::").at(-1);
  const matches = [...index.byId.values()].filter((record) => record.kind === kind && record.name === short);
  if (matches.length > 1) {
    throw new RustSchemaError(`schema reference "${reference}" is ambiguous for kind ${kind}.`);
  }
  return matches[0];
}

/** Builds the currently inferable component contract. A component's props
 * type is present in its function parameters; event ownership is intentionally
 * not inferred from names and remains explicit for a later macro revision. */
export function buildRustComponentContracts(index: RustSchemaIndex): RustComponentContract[] {
  return index.components.map((component) => {
    const propReferences = component.params
      .map((parameter) => resolveVooyaSchemaReference(index, parameter.type, "props"))
      .filter((record): record is RustPropsSchema => record !== undefined);
    if (propReferences.length > 1) {
      throw new RustSchemaError(`component ${component.id} references multiple props schemas.`);
    }
    const eventReferences = component.group
      ? index.events.filter((event) => event.group === component.group)
      : [];
    if (eventReferences.length > 1) {
      throw new RustSchemaError(`component ${component.id} references multiple events schemas.`);
    }
    return {
      component,
      ...(propReferences[0] ? { props: propReferences[0] } : {}),
      ...(eventReferences[0] ? { events: eventReferences[0] } : {}),
    };
  });
}

function readCustomSection(payload: Uint8Array, sectionOffset: number): { name: string; data: Uint8Array } {
  const nameLength = readVarUint32(payload, 0, sectionOffset);
  const nameEnd = nameLength.next + nameLength.value;
  if (nameEnd > payload.length) throw new RustSchemaError(`custom section at byte ${sectionOffset} has a truncated name.`);
  let name: string;
  try {
    name = new TextDecoder("utf-8", { fatal: true }).decode(payload.subarray(nameLength.next, nameEnd));
  } catch {
    throw new RustSchemaError(`custom section at byte ${sectionOffset} has an invalid UTF-8 name.`);
  }
  return { name, data: payload.subarray(nameEnd) };
}

function parseRecords(data: Uint8Array, sectionOffset: number): RustSchemaRecord[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new RustSchemaError(`schema custom section at byte ${sectionOffset} is not valid UTF-8.`);
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) throw new RustSchemaError(`schema custom section at byte ${sectionOffset} is empty.`);
  return lines.map((line, index) => parseRecord(line, sectionOffset, index));
}

function parseRecord(text: string, sectionOffset: number, index: number): RustSchemaRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RustSchemaError(`schema custom section at byte ${sectionOffset}, record ${index + 1}, is not valid JSON.`);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if ("kind" in record || "id" in record || "name" in record) {
      if (record.version === undefined) {
        throw new RustSchemaError(`schema custom section at byte ${sectionOffset}, record ${index + 1}, is missing a schema version.`);
      }
      if (typeof record.version !== "number" || !Number.isInteger(record.version)) {
        throw new RustSchemaError(`schema custom section at byte ${sectionOffset}, record ${index + 1}, has an invalid schema version.`);
      }
    }
  }
  if (value && typeof value === "object" && "version" in value && typeof value.version === "number" && ![1, 2].includes(value.version)) {
    throw new RustSchemaError(`schema record uses version ${value.version}; expected 1 or ${VOO_SCHEMA_VERSION}.`);
  }
  if (!isRecord(value)) throw new RustSchemaError(`schema custom section at byte ${sectionOffset}, record ${index + 1}, is not a supported record.`);
  return value;
}

function isRecord(value: unknown): value is RustSchemaRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.version !== "number" || !Number.isInteger(record.version) || typeof record.id !== "string" || typeof record.name !== "string") return false;
  if (record.group !== undefined && record.group !== null && typeof record.group !== "string") return false;
  if (record.kind === "component" && record.return !== undefined && typeof record.return !== "string") return false;
  if (record.kind === "component" && record.styles !== undefined && !isStyles(record.styles)) return false;
  if (record.version === 2 && !hasResolvedAbi(record)) return false;
  if (record.kind === "props") return isParameters(record.fields);
  if (record.kind === "events") return isMethods(record.methods);
  if (record.kind === "component") return isParameters(record.params);
  if (record.kind === "store") return (record.snapshotSource === undefined || isSchemaSource(record.snapshotSource)) && isMethods(record.actions) && (record.snapshot === undefined || record.snapshot === null || typeof record.snapshot === "string");
  if (record.kind === "type") return (record.direction === "from" || record.direction === "to") && isTypeShape(record.shape);
  return false;
}

function hasResolvedAbi(record: Record<string, unknown>): boolean {
  const parameters = (value: unknown) => isParameters(value) && value.every(item => isAbiType(item.abi));
  const methods = (value: unknown) => isMethods(value) && value.every(method => parameters(method.params));
  if (record.kind === "props") return parameters(record.fields);
  if (record.kind === "events") return methods(record.methods);
  if (record.kind === "store") return methods(record.actions) && (record.snapshot == null || isAbiType(record.snapshotAbi));
  if (record.kind === "type") {
    if (typeof record.identity !== "string" || !record.identity || !isTypeShape(record.shape)) return false;
    return record.shape.kind !== "struct" || parameters(record.shape.fields);
  }
  return true;
}

function isAbiType(value: unknown, depth = 0): value is RustAbiType {
  if (depth > 128 || !value || typeof value !== "object" || Array.isArray(value)) return false;
  const type = value as Record<string, unknown>;
  if (type.kind === "scalar") return typeof type.name === "string" && /^(?:i8|u8|i16|u16|i32|u32|isize|usize|i64|u64|i128|u128|f32|f64|bool|String)$/.test(type.name);
  if (type.kind === "named") return typeof type.identity === "string" && type.identity.length > 0 && (type.direction === "from" || type.direction === "to");
  if (type.kind === "option" || type.kind === "vec" || type.kind === "map") return isAbiType(type.value, depth + 1);
  if (type.kind === "tuple") return Array.isArray(type.items) && type.items.length >= 2 && type.items.length <= 4 && type.items.every(item => isAbiType(item, depth + 1));
  if (type.kind === "unsupported") return typeof type.reason === "string";
  return type.kind === "opaque";
}

function isTypeShape(value: unknown): value is RustTypeSchema["shape"] {
  if (!value || typeof value !== "object") return false;
  const shape = value as Record<string, unknown>;
  if (shape.kind === "struct") return isParameters(shape.fields);
  return shape.kind === "enum" && Array.isArray(shape.variants) && shape.variants.every((variant) => typeof variant === "string");
}

function isStyles(value: unknown): value is RustStyleDependency[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const style = item as Record<string, unknown>;
    return typeof style.path === "string" && typeof style.scoped === "boolean";
  });
}

function isSchemaSource(value: unknown): value is RustSchemaSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return typeof source.file === "string" && source.file.length > 0
    && (source.line === undefined || (Number.isInteger(source.line) && typeof source.line === "number" && source.line > 0))
    && (source.column === undefined || (source.line !== undefined && Number.isInteger(source.column) && typeof source.column === "number" && source.column > 0));
}

function isParameters(value: unknown): value is RustSchemaParameter[] {
  return Array.isArray(value) && value.every((item) => isParameter(item));
}

function isMethods(value: unknown): value is Array<{ name: string; params: RustSchemaParameter[] }> {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const method = item as Record<string, unknown>;
    return typeof method.name === "string" && isParameters(method.params);
  });
}

function isParameter(value: unknown): value is RustSchemaParameter {
  if (!value || typeof value !== "object") return false;
  const parameter = value as Record<string, unknown>;
  return typeof parameter.name === "string" && typeof parameter.type === "string" && (parameter.source === undefined || isSchemaSource(parameter.source));
}

function readVarUint32(bytes: Uint8Array, start: number, sectionOffset: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let offset = start;
  for (let count = 0; count < 5; count += 1) {
    if (offset >= bytes.length) throw new RustSchemaError(`truncated section length near byte ${sectionOffset}.`);
    const byte = bytes[offset++];
    if (count === 4 && (byte & 0x70) !== 0) throw new RustSchemaError(`section length near byte ${sectionOffset} overflows u32.`);
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, next: offset };
    shift += 7;
  }
  throw new RustSchemaError(`section length near byte ${sectionOffset} is not a valid u32.`);
}
