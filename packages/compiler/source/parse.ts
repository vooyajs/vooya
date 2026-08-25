import type {
  ManifestComponent,
  ParsedComponent,
  SourceComponent,
  VooEvent,
  VooEventParameter,
  VooProp,
  VooStyle,
} from "./types.js";
import { publicAbiTypeDiagnostic } from "./abi.js";


const defaultRuntime = "@vooya/core";

type Attributes = Record<string, string | true>;
type Block = { attributes: Attributes; content: string; openLine: number; contentLine: number };

export class VooParseError extends Error {
  id: string;
  line: number;

  constructor(message: string, id: string, line: number) {
    super(`${message} (${id}:${line})`);
    this.name = "VooParseError";
    this.id = id;
    this.line = line;
  }
}

export function parseVooComponent(source: string, id = "<anonymous>.voo"): ParsedComponent {
  if (source.trimStart().startsWith("<component")) return parseSourceComponent(source, id);
  return parseManifestComponent(source, id);
}

function parseSourceComponent(source: string, id: string): SourceComponent {
  const componentBlock = readBlock(source, "component", id, true);
  const rustBlock = readBlock(source, "rust", id, true);
  const styleBlock = readBlock(source, "style", id, false);
  if (!componentBlock || !rustBlock) throw new Error("Required Voo blocks were not read.");
  const name = readComponentName(componentBlock.attributes, id, componentBlock.openLine);
  const contract = parseContract(componentBlock.content, id, componentBlock.contentLine);

  if (styleBlock) assertAttributes(styleBlock.attributes, new Set(["scoped"]), id, styleBlock.openLine);

  return {
    format: "source",
    name,
    props: contract.props,
    events: contract.events,
    rust: { content: trimBlock(rustBlock.content), startLine: rustBlock.contentLine },
    style: styleBlock
      ? {
          content: trimBlock(styleBlock.content),
          scoped: Object.hasOwn(styleBlock.attributes, "scoped"),
          startLine: styleBlock.contentLine,
        }
      : undefined,
  };
}

function parseContract(source: string, id: string, startLine: number): { props: VooProp[]; events: VooEvent[] } {
  const props: VooProp[] = [];
  const events: VooEvent[] = [];
  let section: "props" | "events" | undefined;
  for (const [index, rawLine] of trimBlock(source).split(/\r?\n/).entries()) {
    const lineNumber = startLine + index;
    const line = stripComment(rawLine).trim();
    if (!line) continue;

    const sectionMatch = line.match(/^(props|events):$/);
    if (sectionMatch) {
      section = sectionMatch[1] as "props" | "events";
      continue;
    }
    if (!section) throw new VooParseError(`Expected "props:" or "events:", found "${line}"`, id, lineNumber);
    if (section === "props") {
      const match = line.match(/^([A-Za-z_][\w]*)\s*:\s*(.+?)(?:\s*=\s*(.+))?$/);
      if (!match) throw new VooParseError(`Invalid prop declaration "${line}"`, id, lineNumber);
      const [, name, rawType, defaultValue] = match;
      const rustType = rawType.trim();
      const diagnostic = publicAbiTypeDiagnostic(rustType, `prop "${name}"`);
      if (diagnostic) throw new VooParseError(diagnostic, id, lineNumber);
      props.push({ name, rustType, required: defaultValue === undefined, defaultValue: defaultValue?.trim() });
      continue;
    }
    const eventMatch = line.match(/^([A-Za-z_][\w-]*)\s*\((.*)\)$/);
    if (!eventMatch) throw new VooParseError(`Invalid event declaration "${line}"`, id, lineNumber);
    events.push({
      name: eventMatch[1],
      parameters: parseEventParameters(eventMatch[1], eventMatch[2], id, lineNumber),
    });
  }
  return { props, events };
}

function parseEventParameters(
  eventName: string,
  source: string,
  id: string,
  line: number,
): VooEventParameter[] {
  if (!source.trim()) return [];
  return splitTopLevel(source).map((parameter) => {
    const match = parameter.trim().match(/^([A-Za-z_][\w]*)\s*:\s*(.+)$/);
    if (!match) throw new VooParseError(`Invalid event parameter "${parameter.trim()}"`, id, line);
    const [, name, rawType] = match;
    const rustType = rawType.trim();
    const diagnostic = publicAbiTypeDiagnostic(rustType, `event "${eventName}" parameter "${name}"`);
    if (diagnostic) throw new VooParseError(diagnostic, id, line);
    return { name, rustType };
  });
}


function splitTopLevel(source: string): string[] {
  const values: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if ("<([{".includes(character)) depth += 1;
    if (">)]}".includes(character)) depth -= 1;
    if (character === "," && depth === 0) { values.push(source.slice(start, index)); start = index + 1; }
  }
  values.push(source.slice(start));
  return values;
}

function readBlock(source: string, tag: string, id: string, required: boolean): Block | undefined {
  const opening = new RegExp(`<${tag}\\b([^>]*)>`).exec(source);
  if (!opening) {
    if (!required) return undefined;
    throw new VooParseError(`Missing <${tag}> block`, id, 1);
  }
  const contentStart = opening.index + opening[0].length;
  const closing = `</${tag}>`;
  const contentEnd = source.indexOf(closing, contentStart);
  if (contentEnd === -1) throw new VooParseError(`Missing ${closing}`, id, lineAt(source, opening.index));
  return {
    attributes: parseAttributes(opening[1], id, lineAt(source, opening.index)),
    content: source.slice(contentStart, contentEnd),
    openLine: lineAt(source, opening.index),
    contentLine: lineAt(source, contentStart) + (/^\r?\n/.test(source.slice(contentStart, contentEnd)) ? 1 : 0),
  };
}

function parseAttributes(source: string, id: string, line: number): Attributes {
  const attributes: Attributes = {};
  let remaining = source.trim();
  while (remaining) {
    const match = remaining.match(/^([A-Za-z_][\w-]*)(?:\s*=\s*"([^"]*)")?\s*/);
    if (!match) throw new VooParseError(`Invalid block attributes "${remaining}"`, id, line);
    attributes[match[1]] = match[2] ?? true;
    remaining = remaining.slice(match[0].length);
  }
  return attributes;
}

function readComponentName(attributes: Attributes, id: string, line: number): string {
  assertAttributes(attributes, new Set(["name"]), id, line);
  const name = attributes.name;
  if (typeof name !== "string" || !/^[A-Z][A-Za-z0-9_]*$/.test(name)) throw new VooParseError("<component> requires a PascalCase name", id, line);
  return name;
}

function assertAttributes(attributes: Attributes, allowed: Set<string>, id: string, line: number): void {
  for (const name of Object.keys(attributes)) if (!allowed.has(name)) throw new VooParseError(`Unknown attribute "${name}"`, id, line);
}

function parseManifestComponent(source: string, id: string): ManifestComponent {
  const lines = source.split(/\r?\n/).map((raw, index) => ({ value: stripComment(raw).trim(), line: index + 1 })).filter(({ value }) => value);
  const declaration = lines.shift();
  const componentMatch = declaration?.value.match(/^component\s+([A-Z][A-Za-z0-9_]*)$/);
  if (!componentMatch) throw new VooParseError('Expected "component Name" or a <component> block', id, declaration?.line ?? 1);
  const component: ManifestComponent = { format: "manifest", name: componentMatch[1], runtime: defaultRuntime, exportName: "", adapters: {}, props: [], events: [] };
  let section: "root" | "adapter" | "props" | "events" = "root";
  for (const { value, line } of lines) {
    const sectionMatch = value.match(/^(adapter|props|events):$/);
    if (sectionMatch) { section = sectionMatch[1] as typeof section; continue; }
    if (section === "root") {
      const fieldMatch = value.match(/^([a-z][a-z0-9-]*)\s*:\s*(.+)$/);
      if (!fieldMatch) throw new VooParseError(`Invalid Voo field "${value}"`, id, line);
      const [, key, fieldValue] = fieldMatch;
      if (key === "runtime") component.runtime = fieldValue;
      else if (key === "export") component.exportName = fieldValue;
      else throw new VooParseError(`Unknown Voo field "${key}"`, id, line);
      continue;
    }
    if (section === "adapter") {
      const match = value.match(/^(vue|react|solid|svelte)\s*:\s*([A-Za-z_$][\w$]*)$/);
      if (!match) throw new VooParseError(`Invalid adapter declaration "${value}"`, id, line);
      component.adapters[match[1]] = match[2];
      continue;
    }
    if (section === "props") {
      const match = value.match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z][\w<>[\]|]*)\s*(required)?$/);
      if (!match) throw new VooParseError(`Invalid prop declaration "${value}"`, id, line);
      component.props.push({ name: match[1], type: match[2], required: match[3] === "required" });
      continue;
    }
    const match = value.match(/^([A-Za-z_$][\w$-]*)\s*:\s*([A-Za-z][\w<>[\]|]*)$/);
    if (!match) throw new VooParseError(`Invalid event declaration "${value}"`, id, line);
    component.events.push({ name: match[1], type: match[2] });
  }
  const declarationLine = declaration?.line ?? 1;
  if (!component.exportName) throw new VooParseError(`Component ${component.name} is missing "export"`, id, declarationLine);
  if (!/^[A-Za-z_$][\w$]*$/.test(component.exportName)) throw new VooParseError(`Component ${component.name} has invalid export "${component.exportName}"`, id, declarationLine);
  return component;
}

export function findCommentIndex(line: string): number {
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (inQuotes) {
      if (character === "\\") {
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === "/" && line[index + 1] === "/") {
      return index;
    }
  }
  return -1;
}

export function stripComment(line: string): string {
  const index = findCommentIndex(line);
  return index === -1 ? line : line.slice(0, index);
}

function trimBlock(source: string): string { return source.replace(/^\r?\n/, "").replace(/\r?\n\s*$/, ""); }
function lineAt(source: string, index: number): number { return source.slice(0, index).split(/\r?\n/).length; }
