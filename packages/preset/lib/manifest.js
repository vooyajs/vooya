// Bootstrap hashes: static.rust-lang.org/rustup/archive/1.28.2/<host>/rustup-init[.exe].sha256
// Bindgen hashes: GitHub release asset SHA-256 digests for wasm-bindgen 0.2.115.
export const RUST_VERSION = "1.94.0";
export const RUSTUP_VERSION = "1.28.2";
export const WASM_BINDGEN_VERSION = "0.2.115";
export const WASM_TARGET = "wasm32-unknown-unknown";
const hosts = {
  "darwin-arm64": ["aarch64-apple-darwin", "20ef5516c31b1ac2290084199ba77dbbcaa1406c45c1d978ca68558ef5964ef5", "aarch64-apple-darwin", "1184392b5468ca63b65f75f95f38110005aa168f6d9c39ca70c0585044d6508b"],
  "darwin-x64": ["x86_64-apple-darwin", "9c331076f62b4d0edeae63d9d1c9442d5fe39b37b05025ec8d41c5ed35486496", "x86_64-apple-darwin", "bc9ba4f200a7a7132b61a28d0fc93692caeb880c1547fb4369f18baa3285eb91"],
  "linux-x64": ["x86_64-unknown-linux-gnu", "20a06e644b0d9bd2fbdbfd52d42540bdde820ea7df86e92e533c073da0cdd43c", "x86_64-unknown-linux-musl", "494df943e4e30a48ea2832e5a299e0e0f52d23f1e037b052cf401f467b820316"],
  "linux-arm64": ["aarch64-unknown-linux-gnu", "e3853c5a252fca15252d07cb23a1bdd9377a8c6f3efa01531109281ae47f841c", "aarch64-unknown-linux-gnu", "f4cc35232554e04d72b61158bcd314ef2b1aa28e7c45d7aad8e76eb01b42c299"],
  "win32-x64": ["x86_64-pc-windows-msvc", "88d8258dcf6ae4f7a80c7d1088e1f36fa7025a1cfd1343731b4ee6f385121fc0", "x86_64-pc-windows-msvc", "370ebd36ffc110346956407793064e3d0b5e77c83ca69ef127a286a665d13636"],
};
export function platformManifest(platform = process.platform, arch = process.arch) {
  const entry = hosts[`${platform}-${arch}`];
  if (!entry) throw new Error(`@vooya/preset does not support ${platform}/${arch}. Use toolchain.mode: "system" with an installed Rust toolchain.`);
  if (platform === "linux" && platform === process.platform && !process.report.getReport().header.glibcVersionRuntime) {
    throw new Error("@vooya/preset currently requires glibc Linux. Use a system toolchain on musl Linux.");
  }
  const [host, rustupHash, bindgenHost, bindgenHash] = entry;
  const executableSuffix = platform === "win32" ? ".exe" : "";
  const bindgenName = `wasm-bindgen-${WASM_BINDGEN_VERSION}-${bindgenHost}`;
  return {
    host, executableSuffix, bindgenName,
    cacheKey: `v1-rust-${RUST_VERSION}-bindgen-${WASM_BINDGEN_VERSION}-rustup-${RUSTUP_VERSION}-${host}`,
    rustup: { url: `https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/${host}/rustup-init${executableSuffix}`, sha256: rustupHash },
    bindgen: { url: `https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${WASM_BINDGEN_VERSION}/${bindgenName}.tar.gz`, sha256: bindgenHash },
  };
}
