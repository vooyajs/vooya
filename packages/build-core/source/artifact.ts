export type ArtifactAssetKind = "wasm" | "javascript" | "worker" | "runtime" | "data" | "style" | "source-map";

export interface ArtifactAsset {
  path: string;
  kind: ArtifactAssetKind;
  required: boolean;
  loadAs: "url" | "module" | "worker" | "bytes";
  integrity?: string;
}

export interface ArtifactEnvironment {
  headers?: Record<string, string>;
  features?: string[];
  notes?: string[];
}

export interface VooyaArtifactManifest {
  formatVersion: 1;
  provider: string;
  component?: string;
  abiVersion?: number;
  contract?: Record<string, unknown>;
  loader?: string;
  assets: ArtifactAsset[];
  environment?: ArtifactEnvironment;
  watchFiles: string[];
}

export interface LanguageProvider<Context = unknown> {
  readonly name: string;
  readonly supportLevel: "stable" | "experimental" | "community" | "lab-only";
  build(context: Context): Promise<VooyaArtifactManifest> | VooyaArtifactManifest;
}

export function createRustArtifact({ runtimeModule, wasm, watchedFiles = [], abiVersion }: {
  runtimeModule: string;
  wasm: string;
  watchedFiles?: string[];
  abiVersion?: number;
}): VooyaArtifactManifest {
  return {
    formatVersion: 1,
    provider: "rust",
    abiVersion,
    loader: runtimeModule,
    assets: [
      { path: runtimeModule, kind: "javascript", required: true, loadAs: "module" },
      { path: wasm, kind: "wasm", required: true, loadAs: "bytes" },
    ],
    watchFiles: [...watchedFiles],
  };
}

export function validateArtifact(manifest: VooyaArtifactManifest): VooyaArtifactManifest {
  if (manifest.formatVersion !== 1) throw new Error("Unsupported Vooya artifact format.");
  if (!manifest.provider) throw new Error("Vooya artifacts require a provider name.");
  if (!Array.isArray(manifest.assets) || !Array.isArray(manifest.watchFiles)) throw new Error("Vooya artifacts require assets and watchFiles arrays.");
  if (!manifest.assets.some((asset) => asset.kind === "wasm" && asset.required)) throw new Error("Vooya artifacts require a required WASM asset.");
  for (const asset of manifest.assets) {
    if (!asset.path || !asset.kind || !asset.loadAs || typeof asset.required !== "boolean") throw new Error("Vooya artifact assets require path, kind, loadAs, and required fields.");
    if (asset.kind === "worker" && asset.loadAs !== "worker") throw new Error("Worker assets must use loadAs=worker.");
  }
  if (manifest.loader && !manifest.assets.some((asset) => asset.path === manifest.loader)) throw new Error("Vooya artifact loader must reference an asset.");
  return manifest;
}
