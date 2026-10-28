// Exercise rustc resolution through packaged macros, static WASM metadata and
// all four declaration targets. No manually constructed schema records here.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApplication, generateRustSchemaDeclaration, buildRustComponentContracts, indexVooyaSchema } from "../packages/provider-rust/dist/index.js";

const root = mkdtempSync(join(tmpdir(), "vooya-type-identity-"));
try {
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/nonstandard.rs"), `
#[derive(vooya::FromJs, vooya::ToJs)]
pub struct Selection { pub enabled: bool }
#[derive(vooya::FromJs, vooya::ToJs)]
pub enum Mode { Open, Closed }
`);
  writeFileSync(join(root, "src/Panel.rs"), `
use vooya as voo;
use voo::ToJs;
#[path = "nonstandard.rs"] mod routed;
mod left {
    #[derive(vooya::FromJs, vooya::ToJs)]
    pub struct Selection { pub count: u64 }
}
mod right {
    #[derive(vooya::FromJs, vooya::ToJs)]
    pub struct Selection { pub label: String }
}
mod twin {
    #[derive(vooya::FromJs, vooya::ToJs)]
    pub struct Selection { pub count: u64 }
}
use self::left::Selection as Imported;
type Alias = right::Selection;
type Optional = Option<std::string::String>;
type Nested = std::collections::BTreeMap<String, Vec<(Imported, Option<Alias>)>>;
#[derive(voo::FromJs)]
pub struct Manual { pub input_only: u32 }
impl voo::ToJs for Manual {
    fn to_js(&self) -> Result<voo::__private::wasm_bindgen::JsValue, voo::__private::wasm_bindgen::JsValue> {
        Ok(voo::__private::wasm_bindgen::JsValue::from_str("manual-output"))
    }
}
#[derive(voo::FromJs, voo::ToJs)]
pub struct Envelope { pub value: Manual }
#[voo::props]
#[derive(voo::FromJs)]
pub struct PanelProps {
    pub imported: Imported,
    pub alias: Alias,
    pub routed: routed::Selection,
    pub twin: twin::Selection,
    pub nested: Nested,
    pub mode: routed::Mode,
    pub optional: Optional,
    pub envelope: Envelope,
}
#[voo::events]
pub trait PanelEvents {
    fn selected(value: Imported, alias: Alias, routed: routed::Selection, envelope: Envelope);
}
#[voo::component]
pub fn Panel(view: &voo::View, props: PanelProps) -> Result<voo::ViewElement, voo::__private::wasm_bindgen::JsValue> {
    view.emit("selected", (props.imported, props.alias, props.routed, props.envelope).to_js()?)?;
    view.element("div")
}
`);
  writeFileSync(join(root, "src/Workflow.rs"), `
use vooya as voo;
mod model {
    #[derive(vooya::FromJs, vooya::ToJs, Clone, PartialEq)]
    pub struct State { pub count: u32 }
}
use model::State as ImportedState;
type SnapshotAlias = ImportedState;
type ActionAlias = Option<ImportedState>;
#[derive(Default)]
pub struct Workflow;
#[voo::store]
impl Workflow {
    #[voo::action]
    pub fn replace(&mut self, value: ActionAlias) { let _ = value; }
    #[voo::snapshot]
    pub fn snapshot(&self) -> SnapshotAlias { ImportedState { count: 1 } }
}
`);
  for (const framework of ["vue", "react", "solid", "svelte"]) {
    const result = buildApplication({ applicationRoot: root, framework });
    assert.equal(result.schema.version, 2);
    const index = indexVooyaSchema(result.schema);
    const selections = index.types.filter(type => type.name === "Selection");
    // The provider also exposes nonstandard.rs as a root module: its record
    // must not replace the distinct routed module identity or leak into output.
    assert.equal(new Set(selections.map(type => type.identity)).size, 5);
    assert.equal(selections.length, 10);
    assert.ok(selections.some(type => type.identity.endsWith("::routed::Selection")));
    const props = index.props[0];
    assert.equal(props.fields[0].abi.identity, selections.find(type => type.identity.endsWith("::left::Selection")).identity);
    assert.equal(props.fields[1].abi.identity, selections.find(type => type.identity.endsWith("::right::Selection")).identity);
    const contract = buildRustComponentContracts(index)[0];
    const code = result.declarations.find(declaration => declaration.code.includes("interface PanelProps")).code;
    const storeCode = result.declarations.find(declaration => declaration.code.includes("createWorkflowStore")).code;
    assert.match(storeCode, /WorkflowSnapshot = State/);
    assert.match(storeCode, /replace\(\.\.\.args: \[State \| null\]\): void/);
    assert.equal((storeCode.match(/export interface State /g) ?? []).length, 1);
    assert.doesNotMatch(storeCode, /Selection|SnapshotAlias|ActionAlias/);
    assert.match(code, /imported: LeftSelection/);
    assert.match(code, /alias: RightSelection/);
    assert.match(code, /routed: RoutedSelection/);
    assert.equal((code.match(/enabled: boolean/g) ?? []).length, 1);
    assert.match(code, /twin: TwinSelection/);
    assert.match(code, /nested: Record<string, Array<\[LeftSelection, RightSelection \| null\]>>/);
    assert.match(code, /optional\?: string \| null/);
    assert.match(code, /export type Mode = \{ type: "Open" \} \| \{ type: "Closed" \}/);
    assert.match(code, /EnvelopeInput \{\n  value: Manual/);
    assert.match(code, /EnvelopeOutput \{\n  value: unknown/);
    assert.equal((code.match(/export interface LeftSelection /g) ?? []).length, 1);
    assert.equal(code, generateRustSchemaDeclaration({ contract, framework, types: [...index.types].reverse() }));
  }
  console.log("Rust type identity passed: aliases, inline modules, path overrides, containers, enums and directional metadata across four frameworks.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
