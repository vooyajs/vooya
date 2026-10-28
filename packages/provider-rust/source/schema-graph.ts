import { RustSchemaError } from "./schema.js";
import type { RustAbiType, RustSchemaSource, RustTypeSchema } from "./schema.js";

interface GraphRoot {
  abi: RustAbiType;
  path: string;
  source?: RustSchemaSource;
}
interface SnapshotValidation extends GraphRoot {
  error(path: string, reason: string, source?: RustSchemaSource): Error;
}

/** Version 2 never resolves a conversion by its display name or source file. */
export function generateResolvedTypes(types: RustTypeSchema[], roots: GraphRoot[], snapshot?: SnapshotValidation, reserved: string[] = []) {
  const key = (identity: string, direction: string) => JSON.stringify([identity, direction]);
  const records = new Map<string, RustTypeSchema>();
  for (const type of types) {
    if (type.version !== 2 || !type.identity) continue;
    const id = key(type.identity, type.direction);
    if (records.has(id)) throw new RustSchemaError(`duplicate conversion metadata for ${type.identity} (${type.direction}).`);
    records.set(id, type);
  }
  const resolve = (abi: Extract<RustAbiType, { kind: "named" }>) => {
    const type = records.get(key(abi.identity, abi.direction));
    if (!type) throw new RustSchemaError(`missing conversion metadata for ${abi.identity} (${abi.direction}); rebuild matching Rust and provider packages.`);
    return type;
  };
  const selected = new Set<RustTypeSchema>();
  const collect = (abi: RustAbiType): void => {
    if (abi.kind === "named") {
      const type = resolve(abi);
      if (selected.has(type)) return;
      selected.add(type);
      if (type.shape.kind === "struct") for (const field of type.shape.fields) collect(requiredAbi(field.abi));
    } else if (abi.kind === "tuple") abi.items.forEach(collect);
    else if (abi.kind === "option" || abi.kind === "vec" || abi.kind === "map") collect(abi.value);
  };
  let opaqueSnapshot = false;
  if (snapshot) {
    const validated = new Set<RustTypeSchema>();
    const validate = (abi: RustAbiType, path: string, source: RustSchemaSource | undefined, ancestors: Set<RustTypeSchema>): void => {
      if (abi.kind === "opaque") { opaqueSnapshot = true; return; }
      if (abi.kind === "unsupported") throw snapshot.error(path, `Unsupported Rust schema type "${abi.reason}".`, source);
      if (abi.kind === "named") {
        let type: RustTypeSchema;
        try { type = resolve(abi); } catch (error) {
          throw snapshot.error(path, error instanceof Error ? error.message : String(error), source);
        }
        if (ancestors.has(type)) throw snapshot.error(path, `Recursive Rust schema reference "${abi.identity}" is not supported.`, source);
        if (validated.has(type)) return;
        if (type.shape.kind === "struct") {
          const next = new Set(ancestors).add(type);
          for (const field of type.shape.fields) validate(requiredAbi(field.abi), `${path}.${field.name}`, field.source ?? source, next);
        }
        validated.add(type);
      } else if (abi.kind === "tuple") abi.items.forEach((item, index) => validate(item, `${path}[${index}]`, source, ancestors));
      else if (abi.kind === "option" || abi.kind === "vec" || abi.kind === "map") validate(abi.value, path, source, ancestors);
    };
    validate(snapshot.abi, snapshot.path, snapshot.source, new Set());
  }
  roots.forEach(root => collect(root.abi));

  // Coalesce only the two directions of the SAME identity, and only when their
  // entire reachable shapes agree. A visited pair terminates recursive graphs.
  const equalAbi = (a: RustAbiType, b: RustAbiType, visited: Set<string>): boolean => {
    if (a.kind !== b.kind) return false;
    if (a.kind === "named" && b.kind === "named") return a.identity === b.identity && equalRecord(resolve(a), resolve(b), visited);
    if (a.kind === "scalar" && b.kind === "scalar") return a.name === b.name;
    if (a.kind === "unsupported" && b.kind === "unsupported") return a.reason === b.reason;
    if (a.kind === "tuple" && b.kind === "tuple") return a.items.length === b.items.length && a.items.every((item, i) => equalAbi(item, b.items[i], visited));
    if ((a.kind === "option" || a.kind === "vec" || a.kind === "map") && (b.kind === "option" || b.kind === "vec" || b.kind === "map")) return equalAbi(a.value, b.value, visited);
    return a.kind === "opaque" && b.kind === "opaque";
  };
  const equalRecord = (a: RustTypeSchema, b: RustTypeSchema, visited: Set<string>): boolean => {
    if (a === b) return true;
    const pair = JSON.stringify([a.identity, a.direction, b.identity, b.direction]);
    if (visited.has(pair)) return true;
    visited.add(pair);
    if (a.shape.kind === "enum" && b.shape.kind === "enum") return JSON.stringify(a.shape.variants) === JSON.stringify(b.shape.variants);
    if (a.shape.kind !== "struct" || b.shape.kind !== "struct") return false;
    const fields = b.shape.fields;
    return a.shape.fields.length === fields.length && a.shape.fields.every((field, i) => field.name === fields[i].name && equalAbi(requiredAbi(field.abi), requiredAbi(fields[i].abi), visited));
  };
  const representatives = new Map<RustTypeSchema, RustTypeSchema>();
  const ordered = [...selected].sort((a, b) => compare(key(a.identity!, a.direction), key(b.identity!, b.direction)));
  for (const type of ordered) {
    const input = records.get(key(type.identity!, "from"));
    representatives.set(type, type.direction === "to" && input && selected.has(input) && equalRecord(input, type, new Set()) ? input : type);
  }
  const emitted = [...new Set(representatives.values())];
  const counts = new Map<string, number>();
  for (const type of emitted) counts.set(type.name, (counts.get(type.name) ?? 0) + 1);
  const aliases = new Map<RustTypeSchema, string>();
  const used = new Set([...reserved, ...emitted.filter(type => counts.get(type.name) === 1).map(type => type.name)]);
  for (const type of emitted) {
    let alias = type.name;
    if (counts.get(type.name)! > 1 || reserved.includes(type.name)) {
      const bothDirections = emitted.some(other => other !== type && other.identity === type.identity);
      const suffix = bothDirections ? type.direction === "from" ? "Input" : "Output" : "";
      const parts = type.identity!.split("::").slice(0, -1);
      let base = `${type.name}${suffix}`;
      alias = base;
      for (let depth = 1; used.has(alias) || (depth === 1 && !bothDirections); depth++) {
        if (depth > parts.length) break;
        const prefix = parts.slice(-depth).join("_").split(/[^A-Za-z0-9]+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join("");
        base = `${prefix}${type.name}${suffix}`;
        if (!/^[A-Za-z_]/.test(base)) base = `Type${base}`;
        alias = base;
      }
      let ordinal = 2;
      while (used.has(alias)) alias = `${base}${ordinal++}`;
    }
    used.add(alias);
    aliases.set(type, alias);
  }
  const render = (abi: RustAbiType): string => {
    switch (abi.kind) {
      case "scalar": return scalarType(abi.name);
      case "named": return aliases.get(representatives.get(resolve(abi))!)!;
      case "option": return `${render(abi.value)} | null`;
      case "vec": return `Array<${render(abi.value)}>`;
      case "map": return `Record<string, ${render(abi.value)}>`;
      case "tuple": return `[${abi.items.map(render).join(", ")}]`;
      case "opaque": return "unknown";
      case "unsupported": throw new Error(`Unsupported Rust schema type "${abi.reason}".`);
    }
  };
  const code = emitted.sort((a, b) => compare(aliases.get(a)!, aliases.get(b)!)).map(type => {
    const alias = aliases.get(type)!;
    if (type.shape.kind === "enum") return `export type ${alias} = ${type.shape.variants.map(variant => `{ type: ${JSON.stringify(variant)} }`).join(" | ")};\n\n`;
    const fields = type.shape.fields.map(field => {
      const abi = requiredAbi(field.abi);
      const name = /^[A-Za-z_$][\w$]*$/.test(field.name) ? field.name : JSON.stringify(field.name);
      return `  ${name}${abi.kind === "option" ? "?" : ""}: ${render(abi)};`;
    }).join("\n");
    return `export interface ${alias} {\n${fields}\n}\n\n`;
  }).join("");
  const emittedNames = new Set(aliases.values());
  return { code, render, has: (name: string) => emittedNames.has(name), opaqueSnapshot };
}

export function requiredAbi(abi: RustAbiType | undefined): RustAbiType {
  if (!abi) throw new RustSchemaError("version 2 conversion is missing its ABI descriptor.");
  return abi;
}

function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function scalarType(name: string): string {
  if (name === "String") return "string";
  if (name === "bool") return "boolean";
  return /^(?:i64|u64|i128|u128)$/.test(name) ? "bigint" : "number";
}
