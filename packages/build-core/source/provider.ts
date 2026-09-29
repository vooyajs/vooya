// Internal build seam. Provider-specific options and schema stay with the
// provider; bundlers consume the common generated assets and watch inputs.
export type MappedDiagnostic = string;
export interface BuildAsset { path: string; code: string }
export interface WasmAsset { path: string; bytes: Uint8Array }
export interface GeneratedCss { componentId: string; code: string }
export interface GeneratedDeclaration {
  componentId: string;
  framework: "vue" | "react" | "solid" | "svelte";
  code: string;
}
export interface BuildArtifact {
  workspaceRoot: string;
  runtimeModule: string;
  javascript: BuildAsset;
  wasm: WasmAsset;
  css: GeneratedCss[];
  declarations: GeneratedDeclaration[];
  watchedFiles: string[];
  diagnostics: MappedDiagnostic[];
  metadata: { buildMode: "production" | "development"; abiVersions: number[] };
}

export interface BuildProvider<Options, Artifact extends BuildArtifact> {
  build(options: Options): Artifact;
}
