// @ts-nocheck
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform as hostPlatform, tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { prepareProjectToolchain } from "./managed-toolchain.js";
import type { ToolchainMode } from "./managed-toolchain.js";
import { VooyaUserError } from "./errors.js";

export const WASM_BINDGEN_VERSION = "0.2.115";
export const WASM_TARGET = "wasm32-unknown-unknown";

const toolchainCache = new Map();

export type ToolchainEnvironment = Record<string, string | undefined>;
export type ToolchainRun = (
  command: string,
  args: string[],
  options?: { cwd?: string; env?: ToolchainEnvironment },
) => unknown;
export type ToolchainExists = (path: string) => boolean;

export interface ResolveToolchainOptions {
  mode?: ToolchainMode;
  env?: ToolchainEnvironment;
  cwd?: string;
  platform?: string;
  home?: string;
  run?: ToolchainRun;
  exists?: ToolchainExists;
  probeManifestPath?: string;
  cargoPath?: string;
}

export interface ResolvedToolchain {
  cargo: { path: string; version: string };
  rustc: { path: string; version: string; verboseVersion: string; sysroot: string };
  target: { triple: string; libdir: string };
  wasmBindgen: { path: string; version: string };
  cargoCandidates: string[];
  firstCargoPath?: string;
  selectedCargoIndex: number;
  cargoSelection: "explicit" | "path" | "managed";
  cargoPathWarning?: string;
  environment: ToolchainEnvironment;
}

export function clearToolchainCache() {
  toolchainCache.clear();
}

/**
 * The build and doctor commands must consume one complete toolchain. In
 * particular, rustc is discovered from Cargo's own verbose invocation rather
 * than by asking PATH for an unrelated rustc.
 */
export function resolveToolchain({
  env = process.env,
  cwd = process.cwd(),
  platform = hostPlatform(),
  home = homedir(),
  run = runCommand,
  exists = existsSync,
  probeManifestPath = undefined,
  cargoPath = undefined,
  mode = "auto",
}: ResolveToolchainOptions = {}): ResolvedToolchain {
  const paths = platform === "win32" ? win32 : posix;
  const managed = prepareProjectToolchain({ cwd, env, mode, cargoPath });
  if (managed) cargoPath = managed.cargoPath;
  const environment = managed?.environment ?? { ...env };
  const cacheKey = getToolchainCacheKey({
    cargoPath,
    environment,
    cwd,
    home,
    platform,
    probeManifestPath,
    run,
    exists,
  });
  if (cacheKey && toolchainCache.has(cacheKey)) return toolchainCache.get(cacheKey);

  if (cargoPath !== undefined && (typeof cargoPath !== "string" || !cargoPath.trim())) {
    throw new ToolchainResolutionError(
      "Vooya toolchain.cargoPath must be a non-empty string.",
      [],
      [],
    );
  }
  const cargoSelection = managed ? "managed" : cargoPath === undefined ? "path" : "explicit";
  const explicitCargoPath =
    cargoSelection !== "path"
      ? paths.isAbsolute(cargoPath)
        ? paths.normalize(cargoPath)
        : paths.resolve(cwd, cargoPath)
      : undefined;
  const cargoCandidates = explicitCargoPath
    ? [explicitCargoPath]
    : findExecutableCandidates("cargo", {
        env: environment,
        cwd,
        platform,
        run,
        exists,
      });

  if (cargoCandidates.length === 0) {
    throw new ToolchainResolutionError(
      cargoSelection === "explicit"
        ? `Vooya could not execute the explicit Cargo path ${explicitCargoPath}.`
        : "Vooya could not find Cargo on PATH. Install Rust through rustup or another supported distribution, then reopen the terminal.",
      [],
      [],
    );
  }

  const wasmBindgenCandidates = findExecutableCandidates("wasm-bindgen", {
    env: environment,
    cwd,
    platform,
    run,
    exists,
  });
  const probe = probeManifestPath
    ? { manifestPath: probeManifestPath, cleanup: () => {} }
    : createProbeProject();
  const attempts = [];

  try {
    for (const cargoPath of cargoCandidates) {
      const attempt = resolveCargoCandidate({
        cargoPath,
        wasmBindgenCandidates,
        cwd,
        env: environment,
        exists,
        home,
        paths,
        platform,
        probeManifestPath: probe.manifestPath,
        run,
      });
      attempts.push(attempt);
      if (attempt.resolved) {
        const selectedCargoIndex = cargoCandidates.indexOf(cargoPath);
        const resolved = {
          ...attempt.resolved,
          cargoCandidates,
          firstCargoPath: cargoSelection === "path" ? cargoCandidates[0] : undefined,
          selectedCargoIndex,
          cargoSelection,
          cargoPathWarning:
            cargoSelection === "path" && selectedCargoIndex > 0
              ? `Selected ${cargoPath}, but ${cargoCandidates[0]} is the first cargo on PATH.`
              : undefined,
          environment,
        };
        if (cacheKey) toolchainCache.set(cacheKey, resolved);
        return resolved;
      }
    }
  } finally {
    probe.cleanup();
  }

  throw new ToolchainResolutionError(
    formatResolutionFailure(cargoCandidates, attempts, cargoSelection),
    attempts,
    cargoCandidates,
  );
}

export class ToolchainResolutionError extends VooyaUserError {
  constructor(message, attempts, cargoCandidates) {
    super(message, { kind: "toolchain" });
    this.name = "ToolchainResolutionError";
    this.stack = `${this.name}: ${this.message}\n`;
    this.attempts = attempts;
    this.cargoCandidates = cargoCandidates;
  }
}

export function formatResolvedToolchain(toolchain) {
  return [
    `cargo selection: ${toolchain.cargoSelection}`,
    `cargo: ${toolchain.cargo.path} (${firstLine(toolchain.cargo.version)})`,
    `rustc: ${toolchain.rustc.path} (${firstLine(toolchain.rustc.version)})`,
    `target: ${toolchain.target.triple} at ${toolchain.target.libdir}`,
    `wasm-bindgen: ${toolchain.wasmBindgen.path} (${toolchain.wasmBindgen.version})`,
  ].join(", ");
}

function resolveCargoCandidate({
  cargoPath,
  wasmBindgenCandidates,
  cwd,
  env,
  exists,
  home,
  paths,
  platform,
  probeManifestPath,
  run,
}) {
  const attempt = { cargoPath, problems: [] };
  const context = { cwd, env };

  const cargoVersion = invoke(run, cargoPath, ["--version"], context);
  if (cargoVersion.error) {
    attempt.problems.push(`Cargo could not be executed: ${describeError(cargoVersion.error)}`);
    return attempt;
  }
  attempt.cargo = { path: cargoPath, version: cargoVersion.value };

  const probeResult = invoke(
    run,
    cargoPath,
    [
      "rustc",
      "--manifest-path",
      probeManifestPath,
      "--offline",
      "-vv",
      "--",
      "--print",
      "sysroot",
    ],
    context,
  );
  const probeOutput = probeResult.value || probeResult.output || "";
  const rustcToken = extractRustcToken(probeOutput);
  const rustcPath = rustcToken
    ? resolveExecutableToken(rustcToken, { cwd, env, platform, run, exists })
    : resolveConfiguredRustc({ cwd, env, platform, run, exists });
  if (!rustcPath) {
    attempt.problems.push(
      probeResult.error
        ? `Cargo did not expose a rustc command: ${describeError(probeResult.error)}`
        : "Cargo did not expose a rustc command in its verbose output.",
    );
    return attempt;
  }
  attempt.rustc = { path: rustcPath };
  if (probeResult.error) {
    attempt.problems.push(`Cargo rustc probe failed: ${describeError(probeResult.error)}`);
    return attempt;
  }

  const rustcVersion = invoke(run, rustcPath, ["--version"], context);
  const rustcVerbose = invoke(run, rustcPath, ["-vV"], context);
  const sysroot = invoke(run, rustcPath, ["--print", "sysroot"], context);
  if (rustcVersion.error || rustcVerbose.error || sysroot.error) {
    attempt.problems.push(
      `Cargo's rustc ${rustcPath} could not be inspected: ${describeError(
        rustcVersion.error ?? rustcVerbose.error ?? sysroot.error,
      )}`,
    );
    return attempt;
  }
  attempt.rustc.version = rustcVersion.value;
  attempt.rustc.verboseVersion = rustcVerbose.value;
  attempt.rustc.sysroot = sysroot.value;

  const targetLibdir = invoke(
    run,
    rustcPath,
    ["--target", WASM_TARGET, "--print", "target-libdir"],
    context,
  );
  let targetReady = true;
  if (targetLibdir.error || !targetLibdir.value) {
    targetReady = false;
    attempt.problems.push(
      `rustc ${rustcPath} cannot provide ${WASM_TARGET}: ${describeError(targetLibdir.error)}`,
    );
  } else if (!exists(targetLibdir.value)) {
    targetReady = false;
    attempt.problems.push(
      `rustc ${rustcPath} does not have ${WASM_TARGET} installed (target-libdir ${targetLibdir.value} does not exist). Install it with: rustup target add ${WASM_TARGET}.`,
    );
  } else {
    attempt.target = { triple: WASM_TARGET, libdir: targetLibdir.value };
  }

  const wasmBindgen = resolveWasmBindgen({
    cargoPath,
    candidates: wasmBindgenCandidates,
    env,
    exists,
    home,
    paths,
    platform,
    run,
    cwd,
  });
  if (!wasmBindgen.resolved) {
    attempt.problems.push(...wasmBindgen.problems);
    return attempt;
  }

  attempt.wasmBindgen = wasmBindgen.resolved;
  if (!targetReady) return attempt;
  attempt.resolved = {
    cargo: attempt.cargo,
    rustc: attempt.rustc,
    target: attempt.target,
    wasmBindgen: attempt.wasmBindgen,
  };
  return attempt;
}

function resolveWasmBindgen({
  cargoPath,
  candidates,
  cwd,
  env,
  exists,
  home,
  paths,
  platform,
  run,
}) {
  const executable = platform === "win32" ? "wasm-bindgen.exe" : "wasm-bindgen";
  const cargoDirectory = paths.dirname(cargoPath);
  const cargoHome = env.CARGO_HOME ?? paths.resolve(home, ".cargo");
  const preferred = [
    paths.join(cargoDirectory, executable),
    paths.join(cargoHome, "bin", executable),
  ];
  const ordered = uniquePaths(
    [...preferred, ...candidates].filter((candidate) => exists(candidate) || candidates.includes(candidate)),
    paths,
  );
  const problems = [];

  for (const path of ordered) {
    const result = invoke(run, path, ["--version"], { cwd, env });
    if (result.error) {
      problems.push(`wasm-bindgen at ${path} could not be executed: ${describeError(result.error)}`);
      continue;
    }
    const version = parseWasmBindgenVersion(result.value);
    if (version !== WASM_BINDGEN_VERSION) {
      problems.push(
        `Found ${result.value || "an unknown wasm-bindgen version"} at ${path}; expected wasm-bindgen ${WASM_BINDGEN_VERSION}. Install the pinned CLI with: cargo install -f wasm-bindgen-cli --version ${WASM_BINDGEN_VERSION}.`,
      );
      continue;
    }
    return { resolved: { path, version }, problems };
  }

  if (ordered.length === 0) {
    problems.push(`wasm-bindgen ${WASM_BINDGEN_VERSION} was not found on PATH. Install it with: cargo install wasm-bindgen-cli --version ${WASM_BINDGEN_VERSION}.`);
  }
  return { problems };
}

function findExecutableCandidates(command, { env, cwd, platform, run, exists = existsSync }) {
  const pathValue = platform === "win32" ? env.Path ?? env.PATH : env.PATH;
  if (!pathValue) return [];
  const paths = platform === "win32" ? win32 : posix;
  const resolver = platform === "win32" ? "where.exe" : "which";
  const primaryArgs = platform === "win32" ? [command] : ["-a", command];
  let result;
  try {
    result = run(resolver, primaryArgs, { cwd, env });
  } catch {
    if (platform !== "win32") {
      try {
        result = run(resolver, [command], { cwd, env });
      } catch {
        result = undefined;
      }
    }
  }
  const commandCandidates = uniquePaths(
    String(result ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^"(.*)"$/, "$1"))
      .filter((line) => line && !/^INFO:/i.test(line)),
    paths,
  );
  const scannedCandidates = scanPathCandidates(command, { env, cwd, pathValue, platform, exists, paths });
  return uniquePaths([...commandCandidates, ...scannedCandidates], paths);
}

function scanPathCandidates(command, { env, cwd, pathValue, platform, exists, paths }) {
  const extensions =
    platform === "win32"
      ? command.includes(".")
        ? [""]
        : (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")
      : [""];
  const candidates = [];
  for (const directory of String(pathValue).split(paths.delimiter)) {
    const cleanDirectory = directory.trim().replace(/^"(.*)"$/, "$1");
    if (!cleanDirectory) continue;
    const absoluteDirectory = paths.isAbsolute(cleanDirectory) ? cleanDirectory : paths.resolve(cwd, cleanDirectory);
    for (const extension of extensions) {
      const candidate = paths.join(absoluteDirectory, `${command}${extension}`);
      if (exists(candidate)) candidates.push(candidate);
    }
  }
  return uniquePaths(candidates, paths);
}

function resolveExecutableToken(token, { cwd, env, platform, run, exists = existsSync }) {
  const paths = platform === "win32" ? win32 : posix;
  if (token.includes("/") || token.includes("\\")) {
    return paths.isAbsolute(token) ? paths.normalize(token) : paths.resolve(cwd, token);
  }
  const candidates = findExecutableCandidates(token, { cwd, env, platform, run, exists });
  return candidates[0] ?? token;
}

function resolveConfiguredRustc({ cwd, env, platform, run, exists = existsSync }) {
  if (!env.RUSTC) return undefined;
  return resolveExecutableToken(env.RUSTC, { cwd, env, platform, run, exists });
}

function extractRustcToken(output) {
  // Cargo honors CARGO_TERM_COLOR=always in CI, including when its output is
  // captured instead of attached to a terminal. Strip those presentation-only
  // sequences before looking for the verbose `Running` command.
  const text = String(output).replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
  const commands = [
    ...text.matchAll(/Running\s+`([\s\S]*?)`/g),
    ...text.matchAll(/Running\s+'([\s\S]*?)'/g),
  ].map((match) => match[1]);
  for (const command of commands.reverse()) {
    const tokens = tokenizeCommand(command);
    for (const token of tokens) {
      const value = token.includes("=") ? token.slice(token.indexOf("=") + 1) : token;
      if (isRustcToken(value)) return value;
    }
  }
  return undefined;
}

function tokenizeCommand(command) {
  const tokens = [];
  let token = "";
  let quote;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote) {
      if (character === "\\" && quote === '"' && command[index + 1] === '"') {
        token += '"';
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      } else {
        token += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
    } else {
      token += character;
    }
  }
  if (token) tokens.push(token);
  return tokens;
}

function isRustcToken(value) {
  const basename = value.split(/[\\/]/).at(-1)?.toLowerCase();
  return basename === "rustc" || basename === "rustc.exe";
}

function parseWasmBindgenVersion(output) {
  return /^wasm-bindgen\s+(\d+\.\d+\.\d+)(?:\s|$)/m.exec(output)?.[1];
}

function createProbeProject() {
  const directory = mkdtempSync(join(tmpdir(), "vooya-toolchain-"));
  mkdirSync(join(directory, "src"), { recursive: true });
  writeFileSync(
    join(directory, "Cargo.toml"),
    `[package]\nname = "vooya_toolchain_probe"\nversion = "0.0.0"\nedition = "2021"\n`,
  );
  writeFileSync(join(directory, "src/main.rs"), "fn main() {}\n");
  return {
    manifestPath: join(directory, "Cargo.toml"),
    cleanup: () => rmSync(directory, { force: true, recursive: true }),
  };
}

function invoke(run, command, args, options) {
  try {
    return { value: String(run(command, args, options) ?? "").trim() };
  } catch (error) {
    return {
      error,
      output: String(error?.output ?? "").trim(),
    };
  }
}

function runCommand(command, args, { cwd, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [result.stdout, result.stderr]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join("\n")
    .trim();
  if (result.error || result.status !== 0) {
    const error = new Error(
      result.error?.message ?? `Command ${command} exited with code ${result.status}.`,
    );
    error.output = output;
    throw error;
  }
  return output;
}

function describeError(error) {
  if (!error) return "the command returned no output";
  const message = error instanceof Error ? error.message : String(error);
  const output = String(error.output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-2)
    .join(" ");
  return output && !message.includes(output) ? `${message}: ${output}` : message;
}

function formatResolutionFailure(cargoCandidates, attempts, cargoSelection) {
  const lines = [
    "Vooya could not resolve a coherent Rust/WASM toolchain.",
    `${cargoSelection === "explicit" ? "Explicit Cargo path" : "Cargo candidates"}: ${cargoCandidates.join(", ")}`,
  ];
  for (const attempt of attempts) {
    lines.push(`- ${attempt.cargoPath}: ${attempt.problems.join(" ") || "did not satisfy the toolchain requirements"}`);
  }
  lines.push(
    `The selected toolchain must provide ${WASM_TARGET} through the rustc used by Cargo and wasm-bindgen ${WASM_BINDGEN_VERSION}. If the compiler is not rustup-managed, install and select a rustup toolchain before retrying.`,
  );
  return lines.join("\n");
}

function getToolchainCacheKey({ cargoPath, environment, cwd, home, platform, probeManifestPath, run, exists }) {
  if (run !== runCommand || exists !== existsSync) return undefined;
  return JSON.stringify({
    cargoPath,
    cwd,
    home,
    platform,
    probeManifestPath,
    path: environment.PATH,
    Path: environment.Path,
    CARGO_HOME: environment.CARGO_HOME,
    RUSTUP_HOME: environment.RUSTUP_HOME,
    RUSTUP_TOOLCHAIN: environment.RUSTUP_TOOLCHAIN,
    RUSTC: environment.RUSTC,
    RUSTC_WRAPPER: environment.RUSTC_WRAPPER,
    RUSTC_WORKSPACE_WRAPPER: environment.RUSTC_WORKSPACE_WRAPPER,
  });
}

function uniquePaths(values, paths) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = paths.normalize(value);
    const key = paths === win32 ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function firstLine(value) {
  return String(value ?? "unavailable").split(/\r?\n/)[0];
}
