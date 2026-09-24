/** Provider-neutral output consumed by bundler adapters. */
export interface ArtifactAsset {
  path: string;
  kind: "wasm" | "javascript" | "worker" | "runtime" | "data" | "style" | "source-map";
  required: boolean;
}

export interface ArtifactEnvironment {
  headers?: Record<string, string>;
  features?: string[];
  notes?: string[];
}

export interface VooyaArtifact {
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
  build(context: Context): Promise<VooyaArtifact> | VooyaArtifact;
}

export function createRustArtifact({ runtimeModule, wasm, watchedFiles = [] }: {
  runtimeModule: string;
  wasm: string;
  watchedFiles?: string[];
}): VooyaArtifact {
  return {
    formatVersion: 1,
    provider: "rust",
    loader: runtimeModule,
    assets: [
      { path: runtimeModule, kind: "javascript", required: true },
      { path: wasm, kind: "wasm", required: true },
    ],
    watchFiles: [...watchedFiles],
  };
}

export function assertArtifact(artifact: VooyaArtifact): VooyaArtifact {
  if (artifact.formatVersion !== 1) throw new Error("Unsupported Vooya artifact format.");
  if (!artifact.provider) throw new Error("Vooya artifacts require a provider name.");
  if (!Array.isArray(artifact.assets) || !Array.isArray(artifact.watchFiles)) {
    throw new Error("Vooya artifacts require assets and watchFiles arrays.");
  }
  for (const asset of artifact.assets) {
    if (!asset.path || !asset.kind || typeof asset.required !== "boolean") {
      throw new Error("Vooya artifact assets require path, kind, and required fields.");
    }
  }
  if (!artifact.assets.some((asset) => asset.kind === "wasm" && asset.required)) {
    throw new Error("Vooya artifacts require a WASM asset.");
  }
  return artifact;
}
