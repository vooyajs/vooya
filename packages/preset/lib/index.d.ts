export interface ManagedToolchain {
  cargoPath: string;
  environment: Record<string, string | undefined>;
  cacheRoot: string;
  rustVersion: string;
  wasmBindgenVersion: string;
}
export interface PrepareToolchainOptions {
  /** Absolute or cwd-relative Vooya-owned cache; defaults to the user's cache directory. */
  cacheDirectory?: string;
  env?: Record<string, string | undefined>;
}
/** Prepares pinned tools without modifying shell configuration or system Rust. */
export function prepareToolchain(options?: PrepareToolchainOptions): Promise<ManagedToolchain>;
export const RUST_VERSION: string;
export const WASM_BINDGEN_VERSION: string;
