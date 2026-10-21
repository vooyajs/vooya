import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { buildPrecompiledVueArtifact, validatePrecompiledVueArtifactOutput } from "../dist/build-core.js";
import { assertBindingsRetry } from "./module-loading-helper.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const counterSource = resolve(repositoryRoot, "tests/fixtures/precompiled-vue/artifact/component/PortableCounter.rs");
const vueVersion = JSON.parse(readFileSync(resolve(repositoryRoot, "packages/vue/package.json"), "utf8")).version;
const productVersion = "1.4.0";
const adapterRange = `^${vueVersion}`;

test("builds a Vue artifact with an installed adapter, independent product version, styles and retryable WASM loading", async () => {
  const fixture = createArtifactFixture({ installedAdapterVersion: "0.2.1", version: "1.4.0+build.7" });
  try {
    writeFileSync(fixture.source, readFileSync(fixture.source, "utf8").replace("pub fn PortableCounter(", "pub fn HTTPView("));
    const staleFiles = ["previous-entry.js", "previous-source.rs"];
    mkdirSync(resolve(fixture.root, "dist"));
    for (const file of staleFiles) writeFileSync(resolve(fixture.root, "dist", file), "stale");
    writeFileSync(resolve(fixture.root, "dist", "component.css"), "stale");
    const manifest = buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source });
    for (const file of staleFiles) {
      assert.equal(existsSync(resolve(fixture.root, "dist", file)), false, `Rebuild must remove ${file}`);
    }
    assert.deepEqual(manifest, {
      formatVersion: 1,
      artifactVersion: "1.4.0+build.7",
      framework: "vue",
      component: "HTTPView",
      abiVersion: 1,
      adapter: { package: "@vooya/vue", version: "0.2.1", range: adapterRange },
      bindings: {
        mount: "voo_h_t_t_p_view_mount",
        dispose: "voo_h_t_t_p_view_dispose",
        updates: { props: "voo_h_t_t_p_view_update_props" },
      },
      loader: "./wasm/vooya_app.js",
      wasm: "./wasm/vooya_app_bg.wasm",
      types: "./index.d.ts",
      stylesheet: "./component.css",
    });
    for (const file of ["manifest.json", "index.js", "index.d.ts", "component.css", "wasm/vooya_app.js", "wasm/vooya_app_bg.wasm"]) {
      assert.ok(readFileSync(resolve(fixture.root, "dist", file)));
    }
    const css = readFileSync(resolve(fixture.root, "dist/component.css"), "utf8");
    assert.match(css, /\[data-voo-scope="voo-[a-f0-9]+"\] \.vooya-portable-counter/);
    assert.match(readFileSync(resolve(fixture.root, "dist/index.js"), "utf8"), /import "\.\/component\.css";/);
    const wasm = new WebAssembly.Module(readFileSync(resolve(fixture.root, "dist/wasm/vooya_app_bg.wasm")));
    const exports = new Set(WebAssembly.Module.exports(wasm).map(({ name }) => name));
    for (const name of [manifest.bindings.mount, manifest.bindings.dispose, ...Object.values(manifest.bindings.updates)]) {
      assert.ok(exports.has(name), `Manifest binding ${name} must exist in the compiled WASM`);
    }
    assert.match(readFileSync(resolve(fixture.root, "dist/index.js"), "utf8"), /from "@vooya\/vue"/);
    assert.match(readFileSync(resolve(fixture.root, "dist/index.d.ts"), "utf8"), /VooyaArtifactManifest/);
    assert.equal(existsSync(resolve(fixture.root, "dist/.artifact-build")), false);
    assert.equal(existsSync(resolve(fixture.root, "dist/component/PortableCounter.rs")), false);
    const manifestText = readFileSync(resolve(fixture.root, "dist/manifest.json"), "utf8");
    assert.doesNotMatch(manifestText, new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await assertBindingsRetry(readFileSync(resolve(fixture.root, "dist/index.js"), "utf8"), {
      runtimeSpecifier: manifest.loader,
      exports: [manifest.bindings.mount, manifest.bindings.dispose, ...Object.values(manifest.bindings.updates)],
      runtimeHelpers: new URL(`file://${resolve(fixture.root, "dist/runtime.js")}`).href,
    });
  } finally {
    fixture.cleanup();
  }
});

test("rejects invalid @vooya/vue adapter dependency declarations before building", () => {
  const cases = [
    { options: { vueDependency: null }, message: /must declare a @vooya\/vue runtime dependency/ },
    { options: { vueDependency: "latest" }, message: /unsupported @vooya\/vue dependency "latest"/ },
    { options: { vueDependency: "file:../vue" }, message: /unsupported @vooya\/vue dependency/ },
    { options: { vueDependency: "workspace:*" }, message: /unsupported @vooya\/vue dependency/ },
    { options: { vueDependency: "^0.1.0" }, message: /declared range must include the generated adapter version/ },
  ];
  for (const { options, message } of cases) {
    const fixture = createArtifactFixture(options);
    try {
      assert.throws(
        () => buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source }),
        message,
      );
    } finally {
      fixture.cleanup();
    }
  }
});

test("rejects adapter prereleases excluded by npm dependency ranges before building", () => {
  for (const [installedAdapterVersion, vueDependency] of [
    ["0.2.0-alpha.0", "*"],
    ["0.2.1-alpha.0", "^0.2.0"],
  ]) {
    const fixture = createArtifactFixture({ installedAdapterVersion, vueDependency });
    try {
      assert.throws(
        () => buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source }),
        /declared range must include the generated adapter version/,
      );
      assert.equal(existsSync(resolve(fixture.root, "dist")), false);
    } finally {
      fixture.cleanup();
    }
  }
});

test("validates adapter prereleases using npm dependency range semantics", () => {
  const fixture = createArtifactFixture();
  try {
    for (const [version, range] of [
      ["0.2.0-alpha.0", "*"],
      ["0.2.1-alpha.0", "^0.2.0"],
    ]) {
      writeArtifactOutput(fixture.root, { adapter: { package: "@vooya/vue", version, range } });
      assert.throws(
        () => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")),
        /is outside its declared @vooya\/vue range/,
      );
    }
    writeArtifactOutput(fixture.root, {
      adapter: { package: "@vooya/vue", version: "0.2.0-alpha.0", range: "^0.2.0-alpha.0" },
    });
    validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist"));
  } finally {
    fixture.cleanup();
  }
});

test("validates manifest bindings, loader, stylesheet and entry against shipped output", () => {
  const fixture = createArtifactFixture();
  try {
    const { dist } = buildArtifactFixture(fixture);
    validatePrecompiledVueArtifactOutput(dist);

    const identityCases = [
      ["formatVersion", 2, /manifest formatVersion must be 1/],
      ["framework", "react", /manifest framework must be "vue"/],
      ["component", "", /manifest component must be a non-empty string/],
      ["artifactVersion", "latest", /manifest artifactVersion must be a semver version/],
      ["abiVersion", "1", /manifest abiVersion must be a number/],
    ];
    for (const [field, value, message] of identityCases) {
      updateManifest(dist, (manifest) => {
        manifest.formatVersion = 1;
        manifest.framework = "vue";
        manifest.component = "PortableCounter";
        manifest.artifactVersion = productVersion;
        manifest.abiVersion = 1;
        manifest[field] = value;
      });
      assert.throws(() => validatePrecompiledVueArtifactOutput(dist), message);
    }

    updateManifest(dist, (manifest) => {
      manifest.formatVersion = 1;
      manifest.framework = "vue";
      manifest.component = "PortableCounter";
      manifest.artifactVersion = productVersion;
      manifest.abiVersion = 1;
    });

    const manifestPath = resolve(dist, "manifest.json");
    const originalManifest = readFileSync(manifestPath, "utf8");
    const unattached = JSON.parse(originalManifest);
    unattached.artifactVersion = "9.9.9";
    writeFileSync(manifestPath, `${JSON.stringify(unattached, null, 2)}\n`);
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /index\.js embedded manifest does not match manifest\.json/,
    );
    writeFileSync(manifestPath, originalManifest);

    updateManifest(dist, (manifest) => {
      manifest.bindings.mount = "voo_missing_mount";
    });
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /component "PortableCounter" binding "mount" advertises "voo_missing_mount"/,
    );

    updateManifest(dist, (manifest) => {
      manifest.bindings.mount = "not-an-identifier";
    });
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /binding "mount" must be a JavaScript identifier/,
    );

    updateManifest(dist, (manifest) => {
      manifest.bindings.mount = "voo_portable_counter_mount";
      manifest.adapter.version = "9.9.9";
    });
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /adapter version 9\.9\.9 is outside its declared @vooya\/vue range/,
    );

    updateManifest(dist, (manifest) => {
      manifest.adapter.version = vueVersion;
      manifest.wasm = "./wasm/vooya_app.js";
    });
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /loader references WASM "wasm\/vooya_app_bg\.wasm", but the manifest declares wasm "\.\/wasm\/vooya_app\.js"/,
    );

    updateManifest(dist, (manifest) => {
      manifest.wasm = "./wasm/vooya_app_bg.wasm";
      manifest.loader = "./wasm/alternate.js";
    });
    writeFileSync(resolve(dist, "wasm", "alternate.js"), readFileSync(resolve(dist, "wasm", "vooya_app.js")));
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /index\.js imports loader "\.\/wasm\/vooya_app\.js", but the manifest declares "\.\/wasm\/alternate\.js"/,
    );

    updateManifest(dist, (manifest) => {
      manifest.loader = "./wasm/vooya_app.js";
      manifest.stylesheet = "./missing.css";
    });
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /manifest stylesheet must reference a file in dist/,
    );

    updateManifest(dist, (manifest) => {
      manifest.stylesheet = "../component.css";
    });
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /manifest stylesheet must be a package-relative path/,
    );

    updateManifest(dist, (manifest) => {
      manifest.stylesheet = "./component.css";
    });
    const loader = resolve(dist, "wasm/vooya_app.js");
    const original = readFileSync(loader, "utf8");
    writeFileSync(loader, original.replaceAll("voo_portable_counter_dispose", "voo_removed_dispose"));
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /binding "dispose" advertises "voo_portable_counter_dispose"/,
    );
    writeFileSync(loader, original);
    writeFileSync(loader, original.replaceAll("voo_abi_version", "voo_removed_abi_version"));
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /loader .* must export voo_abi_version/,
    );
    writeFileSync(loader, original);

    const entryPath = resolve(dist, "index.js");
    const entrySource = readFileSync(entryPath, "utf8");
    writeFileSync(entryPath, entrySource.replace('import "./component.css";\n', ""));
    assert.throws(
      () => validatePrecompiledVueArtifactOutput(dist),
      /index\.js must import declared stylesheet "\.\/component\.css"/,
    );
    writeFileSync(entryPath, entrySource);
    validatePrecompiledVueArtifactOutput(dist);
  } finally {
    fixture.cleanup();
  }
});

test("keeps unstyled artifacts free of stylesheet assets", () => {
  const fixture = createArtifactFixture({ styled: false });
  try {
    const manifest = buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source });
    assert.equal("stylesheet" in manifest, false);
    assert.equal(existsSync(resolve(fixture.root, "dist", "component.css")), false);
    validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist"));
  } finally {
    fixture.cleanup();
  }
});

test("rejects non-Rust artifact inputs", () => {
  const fixture = createArtifactFixture();
  try {
    assert.throws(() => buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source + ".txt" }), /explicit source \.rs file/);
  } finally { fixture.cleanup(); }
});

test("rejects an absent package root and a source outside it", () => {
  const fixture = createArtifactFixture();
  try {
    assert.throws(
      () => buildPrecompiledVueArtifact({ packageRoot: resolve(fixture.root, "missing"), source: fixture.source }),
      /packageRoot must be an existing directory/,
    );
    assert.throws(
      () => buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: counterSource }),
      /source must stay inside packageRoot/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("rejects output outside the package dist directory", () => {
  const fixture = createArtifactFixture();
  try {
    assert.throws(
      () => buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source, outputDir: resolve(fixture.root, "generated") }),
      /output must be packageRoot\/dist/,
    );
  } finally {
    fixture.cleanup();
  }
});

test("rejects unsafe or non-file artifact manifest assets", () => {
  const fixture = createArtifactFixture();
  try {
    writeArtifactOutput(fixture.root, { wasm: "./" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /wasm must reference a file/);

    writeArtifactOutput(fixture.root, { wasm: "../outside.wasm" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /wasm must be a package-relative path/);

    writeArtifactOutput(fixture.root, { wasm: "./wasm/missing.wasm" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /wasm must reference a file/);

    writeArtifactOutput(fixture.root, { wasm: "C:\\artifact.wasm" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /wasm must be a package-relative path/);

    writeArtifactOutput(fixture.root, { loader: "../loader.js" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /loader must be a package-relative path/);

    writeArtifactOutput(fixture.root, { stylesheet: "./missing.css" });
    rmSync(resolve(fixture.root, "dist", "missing.css"));
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /stylesheet must reference a file in dist/);

    writeArtifactOutput(fixture.root, { stylesheet: "component.css" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /stylesheet must be a package-relative path/);

    writeArtifactOutput(fixture.root, { stylesheet: resolve(fixture.root, "dist", "component.css") });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /stylesheet must be a package-relative path/);
  } finally {
    fixture.cleanup();
  }
});

test("accepts coherent fake artifact output with and without a stylesheet", () => {
  const fixture = createArtifactFixture();
  try {
    writeArtifactOutput(fixture.root);
    validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist"));

    writeArtifactOutput(fixture.root, { stylesheet: "./component.css" });
    validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist"));
  } finally {
    fixture.cleanup();
  }
});

test("rejects build input and absolute output paths in artifact files", () => {
  const fixture = createArtifactFixture();
  try {
    writeArtifactOutput(fixture.root);
    writeFileSync(resolve(fixture.root, "dist", "component.rs"), "source");
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /must not include build input component\.rs/);

    rmSync(resolve(fixture.root, "dist", "component.rs"));
    writeFileSync(resolve(fixture.root, "dist", "index.js"), resolve(fixture.root, "dist"));
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /must not include an absolute output path/);
  } finally {
    fixture.cleanup();
  }
});

function createArtifactFixture({ vueDependency = adapterRange, version = productVersion, styled = true, installedAdapterVersion } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-artifact-contract-"));
  const componentDirectory = resolve(root, "component");
  mkdirSync(componentDirectory, { recursive: true });
  const source = resolve(componentDirectory, "PortableCounter.rs");
  cpSync(counterSource, source);
  cpSync(counterSource.replace(/\.rs$/u, ".css"), resolve(componentDirectory, "PortableCounter.css"));
  if (!styled) {
    writeFileSync(source, readFileSync(source, "utf8").replace('#[vooya::style("./PortableCounter.css", scoped)]\n', ""));
  }
  const dependencies = vueDependency === null ? {} : { "@vooya/vue": vueDependency };
  writeFileSync(
    resolve(root, "package.json"),
    `${JSON.stringify({ name: "@acme/portable-counter", version, type: "module", dependencies }, null, 2)}\n`,
  );
  if (installedAdapterVersion) {
    const adapter = resolve(root, "node_modules/@vooya/vue");
    mkdirSync(adapter, { recursive: true });
    writeFileSync(resolve(adapter, "package.json"), `${JSON.stringify({
      name: "@vooya/vue",
      version: installedAdapterVersion,
      type: "module",
      exports: { ".": { import: "./index.js" } },
    }, null, 2)}\n`);
    writeFileSync(resolve(adapter, "index.js"), "export {};\n");
  }
  return { root, source, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function buildArtifactFixture(fixture) {
  buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source });
  return { dist: resolve(fixture.root, "dist") };
}

function updateManifest(dist, update) {
  const path = resolve(dist, "manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  update(manifest);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  const entryPath = resolve(dist, "index.js");
  const entry = readFileSync(entryPath, "utf8");
  writeFileSync(entryPath, entry.replace(
    /export const manifest = \{[\s\S]*?\};\nexport function assertArtifactAbi/,
    `export const manifest = ${JSON.stringify(manifest, null, 2)};\nexport function assertArtifactAbi`,
  ));
}

function createManifest(overrides = {}) {
  return {
    formatVersion: 1,
    artifactVersion: productVersion,
    framework: "vue",
    component: "Test",
    abiVersion: 1,
    adapter: { package: "@vooya/vue", version: vueVersion, range: adapterRange },
    bindings: {
      mount: "voo_test_mount",
      dispose: "voo_test_dispose",
      updates: { props: "voo_test_update_props" },
    },
    loader: "./wasm/vooya_app.js",
    wasm: "./wasm/vooya_app_bg.wasm",
    types: "./index.d.ts",
    ...overrides,
  };
}

function writeArtifactOutput(root, overrides = {}) {
  const manifest = createManifest(overrides);
  const dist = resolve(root, "dist");
  mkdirSync(resolve(dist, "wasm"), { recursive: true });
  writeFileSync(resolve(dist, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  const bindings = [manifest.bindings.mount, manifest.bindings.dispose, ...Object.values(manifest.bindings.updates)];
  const styleImport = manifest.stylesheet ? `import ${JSON.stringify(manifest.stylesheet)};\n` : "";
  writeFileSync(resolve(dist, "index.js"), `${styleImport}import init, { ${[...bindings, "voo_abi_version"].join(", ")} } from ${JSON.stringify(manifest.loader)};\nexport default init;\nexport const manifest = ${JSON.stringify(manifest, null, 2)};\nexport function assertArtifactAbi(actual) { if (actual !== manifest.abiVersion) throw new Error("ABI mismatch"); }\n`);
  if (typeof manifest.stylesheet === "string" && manifest.stylesheet.startsWith("./")
    && !manifest.stylesheet.includes("\\") && !manifest.stylesheet.split("/").includes("..")) {
    writeFileSync(resolve(dist, manifest.stylesheet), ".test {}\n");
  }
  writeFileSync(resolve(dist, "index.d.ts"), "export {};\n");
  writeFileSync(resolve(dist, "runtime.js"), "export {};\n");
  writeFileSync(resolve(dist, "wasm", "vooya_app.js"), `${bindings.map((name) => `export function ${name}() {}`).join("\n")}\nexport function voo_abi_version() { return 1; }\nvoid new URL('vooya_app_bg.wasm', import.meta.url);\n`);
  writeFileSync(resolve(dist, "wasm", "vooya_app_bg.wasm"), "wasm");
}
