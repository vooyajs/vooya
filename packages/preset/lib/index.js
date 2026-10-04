import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { x as extract } from "tar";
import { acquireInstallLock } from "./lock.js";
import { platformManifest, RUST_VERSION, WASM_BINDGEN_VERSION, WASM_TARGET } from "./manifest.js";
export { RUST_VERSION, WASM_BINDGEN_VERSION } from "./manifest.js";

function defaultCache(env) {
  if (process.platform === "win32") return join(env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "vooya", "toolchains");
  if (process.platform === "darwin") return join(homedir(), "Library", "Caches", "vooya", "toolchains");
  return join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "vooya", "toolchains");
}

export async function prepareToolchain({ cacheDirectory, env = process.env } = {}) {
  const manifest = platformManifest();
  const cache = resolve(cacheDirectory || env.VOOYA_CACHE_DIR || defaultCache(env));
  const root = join(cache, manifest.cacheKey);
  mkdirSync(cache, { recursive: true });
  const release = await acquireInstallLock(`${root}.lock`);
  try {
    if (!isReady(root, manifest)) {
      // Only same-version staging directories are removed while holding its lock.
      for (const name of readdirSync(cache)) {
        if (name.startsWith(`${manifest.cacheKey}.staging-`)) rmSync(join(cache, name), { recursive: true, force: true });
      }
      const staging = `${root}.staging-${randomUUID()}`;
      mkdirSync(staging);
      try {
        await install(staging, manifest, env);
        writeFileSync(join(staging, "ready.json"), JSON.stringify({ key: manifest.cacheKey }));
        rmSync(root, { recursive: true, force: true });
        renameSync(staging, root);
      } finally { rmSync(staging, { recursive: true, force: true }); }
    }
    return toolchainAt(root, manifest, env);
  } finally { release(); }
}

function isReady(root, manifest) {
  try {
    return JSON.parse(readFileSync(join(root, "ready.json"), "utf8")).key === manifest.cacheKey
      && ["cargo", "rustc"].every(name => existsSync(join(root, "rustup", "toolchains", `${RUST_VERSION}-${manifest.host}`, "bin", `${name}${manifest.executableSuffix}`)))
      && existsSync(join(root, "bin", `wasm-bindgen${manifest.executableSuffix}`));
  } catch { return false; }
}
function toolchainAt(root, manifest, env) {
  const rustBin = join(root, "rustup", "toolchains", `${RUST_VERSION}-${manifest.host}`, "bin");
  // Absolute compiler plus an explicit toolchain override prevent the consumer's
  // rust-toolchain.toml/RUSTC from silently selecting a different compiler.
  const environment = {
    ...env, CARGO_HOME: join(root, "cargo"), RUSTUP_HOME: join(root, "rustup"),
    RUSTUP_TOOLCHAIN: `${RUST_VERSION}-${manifest.host}`,
    RUSTC: join(rustBin, `rustc${manifest.executableSuffix}`),
    RUSTC_WRAPPER: undefined, RUSTC_WORKSPACE_WRAPPER: undefined,
    PATH: [join(root, "bin"), rustBin, join(root, "cargo", "bin"), env.PATH || env.Path || ""].join(delimiter),
  };
  if (process.platform === "win32") delete environment.Path;
  return { cargoPath: join(rustBin, `cargo${manifest.executableSuffix}`), environment, cacheRoot: root, rustVersion: RUST_VERSION, wasmBindgenVersion: WASM_BINDGEN_VERSION };
}
async function install(root, manifest, env) {
  const installer = join(root, `rustup-init${manifest.executableSuffix}`);
  process.stderr.write(`Vooya: preparing Rust ${RUST_VERSION} and wasm-bindgen ${WASM_BINDGEN_VERSION} (${manifest.host}).\n`);
  await downloadVerified(manifest.rustup, installer);
  chmodSync(installer, 0o755);
  await run(installer, ["-y", "--no-modify-path", "--profile", "minimal", "--default-host", manifest.host, "--default-toolchain", RUST_VERSION, "--target", WASM_TARGET], {
    ...env, CARGO_HOME: join(root, "cargo"), RUSTUP_HOME: join(root, "rustup"),
    RUSTUP_INIT_SKIP_PATH_CHECK: "yes", RUSTUP_INIT_SKIP_MSVC_CHECK: "yes",
    // Do not allow ambient mirror variables to replace the pinned upstream source.
    RUSTUP_DIST_SERVER: "https://static.rust-lang.org", RUSTUP_UPDATE_ROOT: "https://static.rust-lang.org/rustup",
    RUSTUP_TOOLCHAIN: undefined,
  });
  const archive = join(root, "wasm-bindgen.tar.gz");
  await downloadVerified(manifest.bindgen, archive);
  const bin = join(root, "bin");
  mkdirSync(bin);
  const member = `${manifest.bindgenName}/wasm-bindgen${manifest.executableSuffix}`;
  await extract({ file: archive, cwd: bin, strip: 1, strict: true, filter: (path, entry) => path === member && entry.type === "File" });
  const executable = join(bin, `wasm-bindgen${manifest.executableSuffix}`);
  chmodSync(executable, 0o755);
  const tools = toolchainAt(root, manifest, env);
  await run(tools.cargoPath, ["--version"], tools.environment);
  await run(tools.environment.RUSTC, ["--target", WASM_TARGET, "--print", "target-libdir"], tools.environment);
  await run(executable, ["--version"], tools.environment);
  rmSync(archive);
  rmSync(installer);
}

// Stream to a private partial file; never execute or extract before verification.
export async function downloadVerified({ url, sha256 }, destination) {
  const partial = `${destination}.partial-${randomUUID()}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`Toolchain download failed: ${response.status} ${url}`);
    const hash = createHash("sha256");
    const digest = new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); callback(null, chunk); } });
    await pipeline(Readable.fromWeb(response.body), digest, createWriteStream(partial, { flags: "wx" }));
    if (hash.digest("hex") !== sha256) throw new Error(`SHA-256 mismatch for ${url}. Download discarded.`);
    renameSync(partial, destination);
  } finally { rmSync(partial, { force: true }); }
}
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(process.stderr);
    child.stderr.pipe(process.stderr);
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Managed toolchain command failed (${code}): ${command}. Check the host linker/SDK prerequisites in @vooya/preset/README.md.`)));
  });
}
