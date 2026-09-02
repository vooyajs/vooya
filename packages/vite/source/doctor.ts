import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform as hostPlatform } from "node:os";
import { posix, win32 } from "node:path";

import {
  WASM_BINDGEN_VERSION,
  WASM_TARGET,
  formatResolvedToolchain,
  resolveVooyaWorkspace,
  resolveToolchain,
} from "@vooya/build-core";
import { inspectGeneratedTypesConfiguration } from "./typescript-config.js";

export { WASM_BINDGEN_VERSION, WASM_TARGET, formatResolvedToolchain, resolveToolchain } from "@vooya/build-core";
export type { ResolvedToolchain } from "@vooya/build-core";

/**
 * Inspect the same complete Rust toolchain that the Vite build will invoke.
 * The function is intentionally dependency-free so `vooya doctor` can run
 * before a Vite project has successfully compiled.
 */
export function inspectToolchain({
  env = process.env,
  run = runCommand,
  platform = hostPlatform(),
  home = homedir(),
  cwd = process.cwd(),
  exists = existsSync,
  probeManifestPath = undefined,
  cargoPath = undefined,
  workspaceRoot = undefined,
  mode = "source",
} = {}) {
  if (mode === "managed") {
    return {
      mode,
      ok: false,
      results: [{ name: "managed toolchain", status: "error", detail: "Managed toolchain installation is not supported yet." }],
      workspaceRoot: resolveVooyaWorkspace(cwd, workspaceRoot).root,
    };
  }
  if (mode === "precompiled") {
    const workspace = resolveVooyaWorkspace(cwd, workspaceRoot);
    return {
      mode,
      ok: true,
      results: [{ name: "precompiled consumer", status: "ok", detail: "Rust, Cargo, rustup, and wasm-bindgen are not required." }],
      workspaceRoot: workspace.root,
    };
  }
  let toolchain;
  let resolutionError;
  try {
    toolchain = resolveToolchain({ env, run, platform, home, cwd, exists, probeManifestPath, cargoPath });
  } catch (error) {
    resolutionError = error;
  }

  const results = [];
  const workspace = resolveVooyaWorkspace(cwd, workspaceRoot);
  results.push({
    name: "generated workspace",
    status: "ok",
    detail: workspace.root,
  });
  const generatedTypesProblem = inspectGeneratedTypesConfiguration(cwd, workspaceRoot);
  if (generatedTypesProblem) {
    results.push({
      name: "generated TypeScript declarations",
      status: "warning",
      detail: generatedTypesProblem.message,
    });
  }
  const attempt = resolutionError?.attempts?.[0];
  const cargo = toolchain?.cargo ?? attempt?.cargo;
  const rustc = toolchain?.rustc ?? attempt?.rustc;
  const wasmBindgen = toolchain?.wasmBindgen ?? attempt?.wasmBindgen;
  const target = toolchain?.target;

  results.push(
    check(
      "cargo",
      Boolean(cargo?.version),
      cargo?.version ?? firstProblem(attempt, /Cargo|cargo/) ?? "not found",
    ),
  );
  if (toolchain?.cargoSelection === "explicit") {
    results.push({
      name: "cargo selection",
      status: "ok",
      detail: `explicit cargo path: ${toolchain.cargo.path}`,
    });
  }
  results.push(
    check(
      "rustc",
      Boolean(rustc?.version),
      rustc?.version ?? firstProblem(attempt, /rustc/) ?? "not found",
    ),
  );

  const rustcVerbose = rustc?.verboseVersion;
  if (rustcVerbose && platform === "win32" && isWindowsMsvcHost(rustcVerbose)) {
    const linkerPath = findExecutable("link.exe", env, run, platform, cwd);
    results.push(
      check(
        "MSVC linker link.exe",
        Boolean(linkerPath),
        linkerPath
          ? `found at ${linkerPath}`
          : "Install Visual Studio Build Tools with the Desktop development with C++ workload, including MSVC C++ build tools and a Windows SDK. Then reopen the terminal so link.exe is available on PATH.",
      ),
    );
  }

  const targetProblem = firstProblem(attempt, /target|wasm32/);
  results.push(
    check(
      `Rust target ${WASM_TARGET}`,
      Boolean(target),
      target
        ? "installed"
        : targetProblem ?? `Install it with: rustup target add ${WASM_TARGET}`,
    ),
  );

  const wasmVersion = wasmBindgen?.version;
  results.push(
    check(
      `wasm-bindgen ${WASM_BINDGEN_VERSION}`,
      wasmVersion === WASM_BINDGEN_VERSION,
      wasmVersion === WASM_BINDGEN_VERSION
        ? `installed (${wasmVersion})`
        : firstProblem(attempt, /wasm-bindgen/) ??
            `Install it with: cargo install wasm-bindgen-cli --version ${WASM_BINDGEN_VERSION}`,
    ),
  );

  if (toolchain) {
    const paths = platform === "win32" ? win32 : posix;
    const rustupHome = env.RUSTUP_HOME ?? paths.resolve(home, ".rustup");
    const sysrootIsRustup = Boolean(rustc.sysroot && isPathInside(rustc.sysroot, paths.resolve(rustupHome, "toolchains"), paths));
    results.push({
      name: "cargo/rustc toolchain",
      status: sysrootIsRustup ? "ok" : "warning",
      detail: sysrootIsRustup
        ? `rustup sysroot: ${rustc.sysroot}`
        : `rustc sysroot: ${rustc.sysroot ?? "unavailable"}. Vooya uses the rustc selected by Cargo, and this is not a rustup toolchain. If builds cannot find ${WASM_TARGET}, install and select a rustup toolchain, then make sure Cargo, rustc, and wasm-bindgen resolve from the intended PATH.`,
    });
    if (toolchain.cargoPathWarning) {
      results.push({
        name: "cargo PATH precedence",
        status: "warning",
        detail: `${toolchain.cargoPathWarning} This may differ from the toolchain you intended to use.`,
      });
    }
  } else {
    results.push({
      name: "cargo/rustc toolchain",
      status: "error",
      detail: resolutionError?.message ?? "Vooya could not resolve a coherent Rust/WASM toolchain.",
    });
  }

  return {
    mode,
    toolchain,
    cargo: cargo?.version,
    cargoPath: toolchain?.cargo.path ?? cargo?.path ?? resolutionError?.cargoCandidates?.[0],
    cargoCandidates: toolchain?.cargoCandidates ?? resolutionError?.cargoCandidates ?? [],
    cargoSelection: toolchain?.cargoSelection,
    rustc: rustc?.version,
    rustcPath: toolchain?.rustc.path ?? rustc?.path,
    rustcVerbose,
    sysroot: rustc?.sysroot,
    targetLibdir: target?.libdir,
    wasmBindgen: wasmBindgen?.version ? `wasm-bindgen ${wasmBindgen.version}` : undefined,
    wasmBindgenPath: toolchain?.wasmBindgen.path ?? wasmBindgen?.path,
    results,
    workspaceRoot: workspace.root,
    ok: results.every((result) => result.status !== "error"),
  };
}

export function formatToolchainReport(report) {
  const lines = ["Vooya doctor", `mode: ${report.mode ?? "source"}`, ""];
  for (const result of report.results) {
    const label = result.status === "ok" ? "ok" : result.status === "warning" ? "warning" : "error";
    lines.push(`[${label}] ${result.name}: ${result.detail}`);
  }
  lines.push("", "Resolved toolchain:");
  if (report.toolchain) {
    lines.push(formatResolvedToolchain(report.toolchain));
  } else {
    lines.push("unavailable");
  }
  lines.push("", `cargo: ${report.cargoPath ?? "not found"}`);
  lines.push(`rustc: ${report.rustcPath ?? "not found"}`);
  lines.push(`wasm-bindgen: ${report.wasmBindgenPath ?? "not found"}`);
  return lines.join("\n");
}

function check(name, passed, detail) {
  return { name, status: passed ? "ok" : "error", detail: detail ?? "available" };
}

function findExecutable(command, env, run, platform, cwd) {
  const path = platform === "win32" ? env.Path ?? env.PATH : env.PATH;
  if (!path) return undefined;
  try {
    const output = run(platform === "win32" ? "where.exe" : "which", [command], { cwd, env });
    return String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
  } catch {
    return undefined;
  }
}

function runCommand(command, args, { cwd = undefined, env = undefined } = {}) {
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
    Object.assign(error, { output });
    throw error;
  }
  return output;
}

function firstProblem(attempt, pattern) {
  return attempt?.problems?.find((problem) => pattern.test(problem));
}

function isPathInside(path, directory, paths) {
  const normalizedPath = normalizePath(paths.resolve(path), paths);
  const normalizedDirectory = normalizePath(paths.resolve(directory), paths);
  const separator = paths.sep;
  return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}${separator}`);
}

function normalizePath(path, paths) {
  return paths === win32 ? path.toLowerCase() : path;
}

function isWindowsMsvcHost(rustcVersion) {
  return /^host:\s*.+-pc-windows-msvc$/m.test(rustcVersion);
}
