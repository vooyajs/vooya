import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { buildPrecompiledVueArtifact, validatePrecompiledVueArtifactOutput } from "../dist/build-core.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const counterSource = resolve(repositoryRoot, "tests/fixtures/precompiled-vue/artifact/component/PortableCounter.voo");
const vueVersion = JSON.parse(readFileSync(resolve(repositoryRoot, "packages/vue/package.json"), "utf8")).version;

test("builds a Vue artifact from an explicitly named non-prefix package", () => {
  const fixture = createArtifactFixture();
  try {
    const manifest = buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source });
    assert.deepEqual(manifest, {
      formatVersion: 1,
      artifactVersion: vueVersion,
      framework: "vue",
      component: "PortableCounter",
      abiVersion: 1,
      bindings: {
        mount: "voo_portable_counter_mount",
        dispose: "voo_portable_counter_dispose",
        updates: { initial: "voo_portable_counter_update_initial" },
      },
      wasm: "./wasm/vooya_app_bg.wasm",
      types: "./index.d.ts",
    });
    for (const file of ["manifest.json", "index.js", "index.d.ts", "wasm/vooya_app.js", "wasm/vooya_app_bg.wasm"]) {
      assert.ok(readFileSync(resolve(fixture.root, "dist", file)));
    }
    assert.match(readFileSync(resolve(fixture.root, "dist/index.js"), "utf8"), /from "@vooya\/vue"/);
    assert.match(readFileSync(resolve(fixture.root, "dist/index.d.ts"), "utf8"), /VooyaArtifactManifest/);
    assert.equal(existsSync(resolve(fixture.root, "dist/.artifact-build")), false);
    assert.equal(existsSync(resolve(fixture.root, "dist/component/PortableCounter.voo")), false);
    const manifestText = readFileSync(resolve(fixture.root, "dist/manifest.json"), "utf8");
    assert.doesNotMatch(manifestText, new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    fixture.cleanup();
  }
});

test("rejects manifest .voo input", () => {
  const fixture = createArtifactFixture();
  try {
    writeFileSync(fixture.source, "component PortableCounter\nexport: portable_counter\nadapter:\n  vue: PortableCounter\n");
    assert.throws(
      () => buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source }),
      /require source .voo input, received manifest/,
    );
  } finally {
    fixture.cleanup();
  }
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

test("rejects Vue dependency version drift", () => {
  const fixture = createArtifactFixture({ vueDependency: "0.0.0" });
  try {
    assert.throws(
      () => buildPrecompiledVueArtifact({ packageRoot: fixture.root, source: fixture.source }),
      /must depend on @vooya\/vue at its exact package version/,
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
    writeArtifactOutput(fixture.root, { wasm: "./", types: "./index.d.ts" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /wasm must reference a file/);

    writeArtifactOutput(fixture.root, { wasm: "../outside.wasm", types: "./index.d.ts" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /wasm must be a package-relative path/);

    writeArtifactOutput(fixture.root, { wasm: "./wasm/missing.wasm", types: "./index.d.ts" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /wasm must reference a file/);

    writeArtifactOutput(fixture.root, { wasm: "C:\\artifact.wasm", types: "./index.d.ts" });
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /wasm must be a package-relative path/);
  } finally {
    fixture.cleanup();
  }
});

test("rejects build input and absolute output paths in artifact files", () => {
  const fixture = createArtifactFixture();
  try {
    writeArtifactOutput(fixture.root);
    writeFileSync(resolve(fixture.root, "dist", "component.voo"), "source");
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /must not include build input component\.voo/);

    rmSync(resolve(fixture.root, "dist", "component.voo"));
    writeFileSync(resolve(fixture.root, "dist", "index.js"), resolve(fixture.root, "dist"));
    assert.throws(() => validatePrecompiledVueArtifactOutput(resolve(fixture.root, "dist")), /must not include an absolute output path/);
  } finally {
    fixture.cleanup();
  }
});

function createArtifactFixture({ vueDependency = vueVersion } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-artifact-contract-"));
  const componentDirectory = resolve(root, "component");
  mkdirSync(componentDirectory, { recursive: true });
  const source = resolve(componentDirectory, "PortableCounter.voo");
  cpSync(counterSource, source);
  writeFileSync(
    resolve(root, "package.json"),
    `${JSON.stringify({ name: "@acme/portable-counter", version: vueVersion, dependencies: { "@vooya/vue": vueDependency } }, null, 2)}\n`,
  );
  return { root, source, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function writeArtifactOutput(root, manifest = { wasm: "./wasm/vooya_app_bg.wasm", types: "./index.d.ts" }) {
  const dist = resolve(root, "dist");
  mkdirSync(resolve(dist, "wasm"), { recursive: true });
  writeFileSync(resolve(dist, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  writeFileSync(resolve(dist, "index.js"), "export {};\n");
  writeFileSync(resolve(dist, "index.d.ts"), "export {};\n");
  writeFileSync(resolve(dist, "wasm", "vooya_app.js"), "export {};\n");
  writeFileSync(resolve(dist, "wasm", "vooya_app_bg.wasm"), "wasm");
}
