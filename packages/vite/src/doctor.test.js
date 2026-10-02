import test from "node:test";
import assert from "node:assert/strict";

import { WASM_BINDGEN_VERSION, WASM_TARGET, createToolchainJsonReport, formatToolchainReport, inspectToolchain } from "../dist/doctor.js";

const probeManifestPath = "/probe/Cargo.toml";

function createRunner({
  platform = "linux",
  cargoPaths,
  cargoInfo,
  wasmBindgenPaths,
  wasmBindgenVersions,
  linkerPath,
} = {}) {
  return (command, args) => {
    if (platform === "win32" && command === "where.exe") {
      if (args[0] === "cargo") return cargoPaths.join("\r\n");
      if (args[0] === "wasm-bindgen") return wasmBindgenPaths.join("\r\n");
      if (args[0] === "link.exe") {
        if (!linkerPath) throw new Error("INFO: Could not find files for the given pattern(s).");
        return linkerPath;
      }
    }
    if (platform !== "win32" && command === "which") {
      const executable = args.at(-1);
      if (executable === "cargo") return cargoPaths.join("\n");
      if (executable === "wasm-bindgen") return wasmBindgenPaths.join("\n");
    }

    const cargo = cargoInfo[command];
    if (cargo) {
      if (args[0] === "--version") return cargo.cargoVersion ?? "cargo 1.94.0";
      if (args[0] === "rustc") {
        const rustcCommand = cargo.rustcPath.includes(" ") ? `"${cargo.rustcPath}"` : cargo.rustcPath;
        const running = `CARGO=${command} ${rustcCommand} --crate-name probe --print sysroot --verbose`;
        return cargo.colorOutput
          ? `Compiling probe\n\u001b[1m\u001b[32m     Running\u001b[0m \`${running}\`\n${cargo.sysroot}\n    Finished`
          : `Compiling probe\n     Running \`${running}\`\n${cargo.sysroot}\n    Finished`;
      }
    }

    for (const info of Object.values(cargoInfo)) {
      if (command !== info.rustcPath) continue;
      if (args[0] === "--version") return info.rustcVersion ?? "rustc 1.94.0";
      if (args[0] === "-vV") return info.rustcVerbose ?? info.rustcVersion ?? "rustc 1.94.0";
      if (args[0] === "--print" && args[1] === "sysroot") return info.sysroot;
      if (args[0] === "--target" && args[1] === WASM_TARGET) return info.targetLibdir;
    }

    const wasmVersion = wasmBindgenVersions[command];
    if (wasmVersion !== undefined && args[0] === "--version") return wasmVersion;
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };
}

function matchingFixture({ platform = "linux", cargoPath, rustcPath, wasmBindgenPath, sysroot, targetLibdir, rustcVerbose } = {}) {
  const cargoInfo = {
    [cargoPath]: {
      rustcPath,
      sysroot,
      targetLibdir,
      rustcVerbose,
    },
  };
  const runner = createRunner({
    platform,
    cargoPaths: [cargoPath],
    cargoInfo,
    wasmBindgenPaths: [wasmBindgenPath],
    wasmBindgenVersions: { [wasmBindgenPath]: `wasm-bindgen ${WASM_BINDGEN_VERSION}` },
  });
  return { cargoInfo, runner };
}

function inspect(options) {
  return inspectToolchain({ ...options, probeManifestPath });
}

test("doctor accepts a matching Cargo-selected rustup toolchain", () => {
  const cargoPath = "/Users/test/.cargo/bin/cargo";
  const rustcPath = "/Users/test/.rustup/toolchains/stable-aarch64-apple-darwin/bin/rustc";
  const wasmBindgenPath = "/Users/test/.cargo/bin/wasm-bindgen";
  const targetLibdir = "/Users/test/.rustup/toolchains/stable-aarch64-apple-darwin/lib/rustlib/wasm32-unknown-unknown/lib";
  const { cargoInfo, runner } = matchingFixture({
    cargoPath,
    rustcPath,
    wasmBindgenPath,
    sysroot: "/Users/test/.rustup/toolchains/stable-aarch64-apple-darwin",
    targetLibdir,
    rustcVerbose: "rustc 1.94.0\nhost: aarch64-apple-darwin",
  });
  const report = inspect({
    env: { PATH: "/Users/test/.cargo/bin:/opt/homebrew/bin", RUSTUP_HOME: "/Users/test/.rustup" },
    run: runner,
    exists: (path) => path === cargoInfo[cargoPath].targetLibdir,
  });

  assert.equal(report.ok, true);
  assert.equal(report.cargoPath, cargoPath);
  assert.equal(report.rustcPath, rustcPath);
  assert.equal(report.toolchain.target.triple, WASM_TARGET);
  assert.equal(report.results.at(-1).status, "ok");
  assert.match(formatToolchainReport(report), /Resolved toolchain/);
  assert.match(formatToolchainReport(report), /stable-aarch64-apple-darwin\/bin\/rustc/);
});

test("doctor parses Cargo verbose output when terminal colors are forced", () => {
  const cargoPath = "/Users/test/.cargo/bin/cargo";
  const rustcPath = "/Users/test/.rustup/toolchains/stable-aarch64-apple-darwin/bin/rustc";
  const wasmBindgenPath = "/Users/test/.cargo/bin/wasm-bindgen";
  const targetLibdir = "/Users/test/.rustup/toolchains/stable-aarch64-apple-darwin/lib/rustlib/wasm32-unknown-unknown/lib";
  const { cargoInfo, runner } = matchingFixture({
    cargoPath,
    rustcPath,
    wasmBindgenPath,
    sysroot: "/Users/test/.rustup/toolchains/stable-aarch64-apple-darwin",
    targetLibdir,
    rustcVerbose: "rustc 1.94.0\nhost: aarch64-apple-darwin",
  });
  cargoInfo[cargoPath].colorOutput = true;

  const report = inspect({
    env: {
      PATH: "/Users/test/.cargo/bin",
      RUSTUP_HOME: "/Users/test/.rustup",
      CARGO_TERM_COLOR: "always",
    },
    run: runner,
    exists: (path) => path === targetLibdir,
  });

  assert.equal(report.ok, true, formatToolchainReport(report));
  assert.equal(report.rustcPath, rustcPath);
});

test("doctor honors an explicit Cargo path without consulting PATH Cargo candidates", () => {
  const cargoPath = "/opt/custom-rust/bin/cargo";
  const rustcPath = "/opt/custom-rust/toolchains/stable/bin/rustc";
  const wasmBindgenPath = "/opt/custom-rust/bin/wasm-bindgen";
  const targetLibdir = "/opt/custom-rust/toolchains/stable/lib/rustlib/wasm32-unknown-unknown/lib";
  const { cargoInfo, runner: baseRunner } = matchingFixture({
    cargoPath,
    rustcPath,
    wasmBindgenPath,
    sysroot: "/opt/custom-rust/toolchains/stable",
    targetLibdir,
    rustcVerbose: "rustc 1.94.0\nhost: aarch64-apple-darwin",
  });
  const commands = [];
  const report = inspect({
    cargoPath,
    env: { PATH: "/opt/homebrew/bin:/Users/test/.cargo/bin", RUSTUP_HOME: "/Users/test/.rustup" },
    run: (command, args, options) => {
      commands.push({ command, args });
      return baseRunner(command, args, options);
    },
    exists: (path) => path === cargoInfo[cargoPath].targetLibdir,
  });

  assert.equal(report.ok, true);
  assert.equal(report.cargoSelection, "explicit");
  assert.equal(report.cargoPath, cargoPath);
  assert.equal(commands.some(({ command, args }) => command === "which" && args.at(-1) === "cargo"), false);
  const output = formatToolchainReport(report);
  assert.match(output, /cargo selection: explicit/);
  assert.match(output, /explicit cargo path/);
  assert.doesNotMatch(output, /cargo PATH precedence/);
});

test("doctor does not fall back when an explicit Cargo path is invalid", () => {
  const explicitCargoPath = "/opt/custom-rust/bin/cargo";
  const pathCargoPath = "/Users/test/.cargo/bin/cargo";
  const { runner: baseRunner } = matchingFixture({
    cargoPath: pathCargoPath,
    rustcPath: "/Users/test/.rustup/toolchains/stable/bin/rustc",
    wasmBindgenPath: "/Users/test/.cargo/bin/wasm-bindgen",
    sysroot: "/Users/test/.rustup/toolchains/stable",
    targetLibdir: "/Users/test/.rustup/toolchains/stable/lib/rustlib/wasm32-unknown-unknown/lib",
    rustcVerbose: "rustc 1.94.0\nhost: aarch64-apple-darwin",
  });
  const report = inspect({
    cargoPath: explicitCargoPath,
    env: { PATH: "/Users/test/.cargo/bin" },
    run: baseRunner,
    exists: () => true,
  });

  assert.equal(report.ok, false);
  assert.equal(report.cargoPath, explicitCargoPath);
  const output = formatToolchainReport(report);
  assert.match(output, /Explicit Cargo path/);
  assert.match(output, /opt\/custom-rust\/bin\/cargo/);
  assert.doesNotMatch(output, /Users\/test\/\.cargo\/bin\/cargo/);
});

test("doctor selects the first Cargo that has a complete toolchain and warns about PATH order", () => {
  const homebrewCargo = "/opt/homebrew/bin/cargo";
  const rustupCargo = "/Users/test/.cargo/bin/cargo";
  const homebrewRustc = "/opt/homebrew/bin/rustc";
  const rustupRustc = "/Users/test/.rustup/toolchains/stable-aarch64-apple-darwin/bin/rustc";
  const homebrewTarget = "/opt/homebrew/lib/rustlib/wasm32-unknown-unknown/lib";
  const rustupTarget = "/Users/test/.rustup/toolchains/stable-aarch64-apple-darwin/lib/rustlib/wasm32-unknown-unknown/lib";
  const wasmBindgenPath = "/Users/test/.cargo/bin/wasm-bindgen";
  const cargoInfo = {
    [homebrewCargo]: {
      rustcPath: homebrewRustc,
      sysroot: "/opt/homebrew/Cellar/rust/1.94.0",
      targetLibdir: homebrewTarget,
      rustcVerbose: "rustc 1.94.0\nhost: aarch64-apple-darwin",
    },
    [rustupCargo]: {
      rustcPath: rustupRustc,
      sysroot: "/Users/test/.rustup/toolchains/stable-aarch64-apple-darwin",
      targetLibdir: rustupTarget,
      rustcVerbose: "rustc 1.94.0\nhost: aarch64-apple-darwin",
    },
  };
  const runner = createRunner({
    cargoPaths: [homebrewCargo, rustupCargo],
    cargoInfo,
    wasmBindgenPaths: [wasmBindgenPath],
    wasmBindgenVersions: { [wasmBindgenPath]: `wasm-bindgen ${WASM_BINDGEN_VERSION}` },
  });
  const report = inspect({
    env: { PATH: "/opt/homebrew/bin:/Users/test/.cargo/bin", RUSTUP_HOME: "/Users/test/.rustup" },
    run: runner,
    exists: (path) => path === rustupTarget,
  });

  assert.equal(report.ok, true);
  assert.equal(report.cargoPath, rustupCargo);
  assert.equal(report.rustcPath, rustupRustc);
  const output = formatToolchainReport(report);
  assert.match(output, /\[warning\] cargo PATH precedence/);
  assert.match(output, /first cargo on PATH/);
  assert.match(output, /Resolved toolchain/);
});

test("doctor explains a missing target and mismatched wasm-bindgen", () => {
  const cargoPath = "/opt/homebrew/bin/cargo";
  const rustcPath = "/opt/homebrew/bin/rustc";
  const wasmBindgenPath = "/opt/homebrew/bin/wasm-bindgen";
  const targetLibdir = "/opt/homebrew/lib/rustlib/wasm32-unknown-unknown/lib";
  const { cargoInfo, runner } = matchingFixture({
    cargoPath,
    rustcPath,
    wasmBindgenPath,
    sysroot: "/opt/homebrew/Cellar/rust/1.94.0",
    targetLibdir,
    rustcVerbose: "rustc 1.94.0\nhost: aarch64-apple-darwin",
  });
  const report = inspect({
    env: { PATH: "/opt/homebrew/bin", RUSTUP_HOME: "/Users/test/.rustup" },
    run: (command, args, options) => {
      if (command === wasmBindgenPath && args[0] === "--version") return "wasm-bindgen 0.2.126";
      return runner(command, args, options);
    },
    exists: () => false,
  });

  assert.equal(report.ok, false);
  const output = formatToolchainReport(report);
  assert.match(output, /rustup target add wasm32-unknown-unknown/);
  assert.match(output, /cargo install -f wasm-bindgen-cli --version 0.2.115/);
  assert.match(output, /install and select a rustup toolchain/);
  assert.doesNotMatch(output, /\.cargo\/bin before/);
});

for (const cliFailure of ["missing", "mismatched"]) {
  test(`doctor preserves an installed target when wasm-bindgen is ${cliFailure}`, () => {
    const cargoPath = "/opt/rust/bin/cargo";
    const rustcPath = "/opt/rust/bin/rustc";
    const wasmBindgenPath = "/opt/rust/bin/wasm-bindgen";
    const targetLibdir = "/opt/rust/lib/rustlib/wasm32-unknown-unknown/lib";
    const { runner } = matchingFixture({
      cargoPath, rustcPath, wasmBindgenPath, targetLibdir,
      sysroot: "/opt/rust",
      rustcVerbose: "rustc 1.94.0\nhost: x86_64-unknown-linux-gnu",
    });
    const report = inspect({
      env: { PATH: "/opt/rust/bin" },
      run: (command, args, options) => {
        if (command === wasmBindgenPath && args[0] === "--version") {
          if (cliFailure === "missing") throw new Error("Executable not found");
          return "wasm-bindgen 0.2.126";
        }
        return runner(command, args, options);
      },
      exists: (path) => path === targetLibdir,
    });

    assert.equal(report.ok, false);
    assert.equal(report.results.find((result) => result.name === `Rust target ${WASM_TARGET}`).status, "ok");
    assert.equal(report.targetLibdir, targetLibdir);
    assert.equal(report.results.find((result) => result.name === `wasm-bindgen ${WASM_BINDGEN_VERSION}`).status, "error");
    assert.doesNotMatch(formatToolchainReport(report), /\[error\] Rust target/);
  });
}

test("doctor resolves a Windows rustc path containing spaces", () => {
  const cargoPath = "C:\\Program Files\\Rust\\bin\\cargo.exe";
  const rustcPath = "C:\\Program Files\\Rust\\toolchains\\stable\\bin\\rustc.exe";
  const wasmBindgenPath = "C:\\Program Files\\Rust\\bin\\wasm-bindgen.exe";
  const targetLibdir = "C:\\Program Files\\Rust\\toolchains\\stable\\lib\\rustlib\\wasm32-unknown-unknown\\lib";
  const { runner } = matchingFixture({
    platform: "win32",
    cargoPath,
    rustcPath,
    wasmBindgenPath,
    sysroot: "C:\\Program Files\\Rust\\toolchains\\stable",
    targetLibdir,
    rustcVerbose: "rustc 1.94.0\nhost: x86_64-pc-windows-msvc",
  });
  const report = inspect({
    platform: "win32",
    home: "C:\\Users\\test",
    env: { Path: "C:\\Program Files\\Rust\\bin", RUSTUP_HOME: "C:\\Users\\test\\.rustup" },
    run: (command, args, options) => {
      if (command === "where.exe" && args[0] === "link.exe") return "C:\\BuildTools\\link.exe";
      return runner(command, args, options);
    },
    exists: (path) => path === targetLibdir,
  });

  assert.equal(report.ok, true);
  assert.equal(report.rustcPath, rustcPath);
});

test("doctor falls back to scanning Windows PATH when where.exe is unavailable", () => {
  const cargoPath = "C:\\Rust\\bin\\cargo.exe";
  const rustcPath = "C:\\Rust\\toolchains\\stable\\bin\\rustc.exe";
  const wasmBindgenPath = "C:\\Rust\\bin\\wasm-bindgen.exe";
  const targetLibdir = "C:\\Rust\\toolchains\\stable\\lib\\rustlib\\wasm32-unknown-unknown\\lib";
  const { runner } = matchingFixture({
    platform: "win32",
    cargoPath,
    rustcPath,
    wasmBindgenPath,
    sysroot: "C:\\Rust\\toolchains\\stable",
    targetLibdir,
    rustcVerbose: "rustc 1.94.0\nhost: x86_64-pc-windows-gnu",
  });
  const report = inspect({
    platform: "win32",
    env: { Path: "C:\\Rust\\bin", PATHEXT: ".com;.exe;.bat;.cmd", RUSTUP_HOME: "C:\\Users\\test\\.rustup" },
    run: (command, args, options) => {
      if (command === "where.exe") throw new Error("where.exe unavailable");
      return runner(command, args, options);
    },
    exists: (path) => {
      const normalized = path.toLowerCase();
      return [cargoPath, wasmBindgenPath, targetLibdir].some((candidate) => candidate.toLowerCase() === normalized);
    },
  });

  assert.equal(report.ok, true, formatToolchainReport(report));
  assert.equal(report.cargoPath, cargoPath);
});

test("doctor uses Windows executable resolution and recognizes a case-insensitive rustup sysroot", () => {
  const cargoPath = "C:\\Users\\test\\.cargo\\bin\\cargo.exe";
  const rustcPath = "C:\\Users\\test\\.rustup\\toolchains\\stable-x86_64-pc-windows-msvc\\bin\\rustc.exe";
  const wasmBindgenPath = "C:\\Users\\test\\.cargo\\bin\\wasm-bindgen.exe";
  const targetLibdir = "C:\\USERS\\TEST\\.RUSTUP\\toolchains\\stable-x86_64-pc-windows-msvc\\lib\\rustlib\\wasm32-unknown-unknown\\lib";
  const { cargoInfo, runner } = matchingFixture({
    platform: "win32",
    cargoPath,
    rustcPath,
    wasmBindgenPath,
    sysroot: "c:\\USERS\\TEST\\.RUSTUP\\toolchains\\stable-x86_64-pc-windows-msvc",
    targetLibdir,
    rustcVerbose: "rustc 1.94.0\nhost: x86_64-pc-windows-msvc",
  });
  const report = inspect({
    platform: "win32",
    home: "C:\\Users\\test",
    env: {
      Path: "C:\\Users\\test\\.cargo\\bin;C:\\Windows\\System32",
      RUSTUP_HOME: "C:\\Users\\test\\.rustup",
    },
    run: (command, args, options) => {
      if (command === "where.exe" && args[0] === "link.exe") return "C:\\BuildTools\\VC\\Tools\\MSVC\\bin\\Hostx64\\x64\\link.exe";
      return runner(command, args, options);
    },
    exists: (path) => path.toLowerCase() === targetLibdir.toLowerCase(),
  });

  assert.equal(report.ok, true);
  assert.equal(report.cargoPath, cargoPath);
  assert.equal(report.rustcPath, rustcPath);
  assert.equal(report.results.at(-1).status, "ok");
  assert.match(formatToolchainReport(report), /\[ok\] MSVC linker link\.exe/);
});

test("doctor explains the Windows Build Tools prerequisite when an MSVC linker is missing", () => {
  const cargoPath = "C:\\Users\\test\\.cargo\\bin\\cargo.exe";
  const rustcPath = "C:\\Users\\test\\.rustup\\toolchains\\stable-x86_64-pc-windows-msvc\\bin\\rustc.exe";
  const wasmBindgenPath = "C:\\Users\\test\\.cargo\\bin\\wasm-bindgen.exe";
  const targetLibdir = "C:\\Users\\test\\.rustup\\toolchains\\stable-x86_64-pc-windows-msvc\\lib\\rustlib\\wasm32-unknown-unknown\\lib";
  const { cargoInfo, runner } = matchingFixture({
    platform: "win32",
    cargoPath,
    rustcPath,
    wasmBindgenPath,
    sysroot: "C:\\Users\\test\\.rustup\\toolchains\\stable-x86_64-pc-windows-msvc",
    targetLibdir,
    rustcVerbose: "rustc 1.94.0\nhost: x86_64-pc-windows-msvc",
  });
  const report = inspect({
    platform: "win32",
    home: "C:\\Users\\test",
    env: {
      Path: "C:\\Users\\test\\.cargo\\bin;C:\\Windows\\System32",
      RUSTUP_HOME: "C:\\Users\\test\\.rustup",
    },
    run: (command, args, options) => {
      if (command === "where.exe" && args[0] === "link.exe") throw new Error("INFO: Could not find files for the given pattern(s).");
      return runner(command, args, options);
    },
    exists: (path) => path.toLowerCase() === targetLibdir.toLowerCase(),
  });

  assert.equal(report.ok, false);
  assert.match(formatToolchainReport(report), /\[error\] MSVC linker link\.exe/);
  assert.match(formatToolchainReport(report), /Visual Studio Build Tools/);
  assert.match(formatToolchainReport(report), /Desktop development with C\+\+/);
});

for (const complete of [true, false]) {
  test(`JSON report uses an allowlist for ${complete ? "successful" : "failed"} diagnostics`, () => {
    const canary = "not-a-real-secret-review-canary";
    const cargoPath = "/opt/rust/bin/cargo";
    const rustcPath = "/opt/rust/bin/rustc";
    const wasmBindgenPath = "/opt/rust/bin/wasm-bindgen";
    const targetLibdir = "/opt/rust/lib/rustlib/wasm32-unknown-unknown/lib";
    const { runner } = matchingFixture({
      cargoPath, rustcPath, wasmBindgenPath, targetLibdir,
      sysroot: "/opt/rust", rustcVerbose: "rustc 1.94.0\nhost: x86_64-unknown-linux-gnu",
    });
    const report = inspect({
      env: { PATH: "/opt/rust/bin", VOOYA_REVIEW_CANARY: canary },
      run: (command, args, options) => {
        if (!complete && command === wasmBindgenPath) return "wasm-bindgen 0.0.0";
        return runner(command, args, options);
      },
      exists: (path) => path === targetLibdir,
    });
    assert.equal(report.ok, complete);
    if (complete) assert.equal(report.toolchain.environment.VOOYA_REVIEW_CANARY, canary);
    // Internal fields added later must not silently become part of the public report.
    report.internalCanary = canary;
    report.results[0].internalCanary = canary;
    const json = JSON.stringify(createToolchainJsonReport(report));
    const publicReport = JSON.parse(json);
    assert.equal(publicReport.schemaVersion, 1);
    assert.equal(publicReport.ok, complete);
    assert.equal(publicReport.cargo.path, cargoPath);
    assert.equal(publicReport.rustc.path, rustcPath);
    assert.equal(publicReport.target.triple, WASM_TARGET);
    assert.equal(publicReport.results.some((result) => result.status === "error"), !complete);
    assert.equal(Object.hasOwn(publicReport, "toolchain"), false);
    assert.equal(json.includes(canary), false);
    assert.equal(json.includes("environment"), false);
  });
}
