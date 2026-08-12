import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertArtifactOutputTarget,
  generateArtifactEntry,
  generateArtifactManifest,
  generateArtifactPackage,
  prepareArtifactComponent,
  replaceOwnedArtifact,
} from "./artifact.js";

const component = {
  name: "Counter",
  props: [{ name: "initial", rustType: "i32", required: true }],
  events: [{ name: "change", parameters: [{ name: "value", rustType: "i32" }] }],
  style: { content: ".counter {}", scoped: true },
};
const definition = {
  abiVersion: 1,
  name: "Counter",
  scopeId: "voo-test",
  props: [{ name: "initial", type: "number", required: true }],
  events: [{ name: "change", parameters: ["value"] }],
};

test("generates a versioned precompiled component manifest", () => {
  assert.deepEqual(
    generateArtifactManifest({
      component,
      definition,
      packageName: "@fixture/counter",
      hasStyle: true,
    }),
    {
      schemaVersion: 1,
      artifact: "vooya-component",
      name: "Counter",
      package: "@fixture/counter",
      vooyaVersion: "0.1.0-alpha.3",
      abiVersion: 1,
      runtime: "./dist/runtime.js",
      wasm: "./dist/runtime_bg.wasm",
      styles: ["./dist/style.css"],
      hosts: {
        vue: { entry: "./dist/vue.js", adapterVersion: "0.1.0-alpha.3" },
        react: { entry: "./dist/react.js", adapterVersion: "0.1.0-alpha.3" },
      },
      props: definition.props,
      events: definition.events,
    },
  );
});

test("omits empty compiled styles from every artifact surface", () => {
  const prepared = prepareArtifactComponent({
    ...component,
    id: "/fixture/Counter.voo",
    style: { content: "", scoped: true },
  });
  assert.equal(prepared.hasStyle, false);
  assert.equal(prepared.compiledStyle, "");
  assert.equal(prepared.component.style, undefined);
  const manifest = generateArtifactManifest({
    component: prepared.component,
    definition,
    packageName: "@fixture/counter",
    hasStyle: false,
  });
  assert.deepEqual(manifest.styles, []);
  assert.doesNotMatch(generateArtifactEntry(component, "vue", false), /style\.css/);
  assert.equal(
    generateArtifactPackage({
      packageName: "@fixture/counter",
      version: "1.2.3",
      hasStyle: false,
    }).sideEffects,
    false,
  );
});

test("refuses unsafe or unowned artifact output directories", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-artifact-safety-"));
  const sourceDir = resolve(root, "source");
  const source = resolve(sourceDir, "Counter.voo");
  mkdirSync(sourceDir);
  writeFileSync(source, "component");

  assert.throws(
    () => assertArtifactOutputTarget({ artifactRoot: sourceDir, sourcePath: source }),
    /contains the source component/,
  );
  const existing = resolve(root, "existing");
  mkdirSync(existing);
  writeFileSync(resolve(existing, "user-file.txt"), "keep");
  assert.throws(
    () => assertArtifactOutputTarget({ artifactRoot: existing, sourcePath: source }),
    /not owned by Vooya/,
  );
  writeFileSync(resolve(existing, ".vooya-artifact"), "{}\n");
  assert.doesNotThrow(() =>
    assertArtifactOutputTarget({ artifactRoot: existing, sourcePath: source }),
  );
});

test("atomically replaces an owned artifact without retaining stale files", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-artifact-replace-"));
  const artifact = resolve(root, "artifact");
  const staging = resolve(root, "staging");
  mkdirSync(artifact);
  mkdirSync(staging);
  writeFileSync(resolve(artifact, ".vooya-artifact"), "{}\n");
  writeFileSync(resolve(artifact, "obsolete.txt"), "old\n");
  writeFileSync(resolve(staging, ".vooya-artifact"), "{}\n");
  writeFileSync(resolve(staging, "current.txt"), "new\n");

  replaceOwnedArtifact(staging, artifact);

  assert.equal(readFileSync(resolve(artifact, "current.txt"), "utf8"), "new\n");
  assert.equal(existsSync(resolve(artifact, "obsolete.txt")), false);
  assert.equal(existsSync(staging), false);
});

test("generates host exports with optional adapter peers", () => {
  const packageJson = generateArtifactPackage({
    packageName: "@fixture/counter",
    version: "1.2.3",
    hasStyle: true,
  });
  assert.equal(packageJson.name, "@fixture/counter");
  assert.equal(packageJson.version, "1.2.3");
  assert.equal(packageJson.exports["./vue"].import, "./dist/vue.js");
  assert.equal(packageJson.exports["./react"].types, "./dist/react.d.ts");
  assert.deepEqual(packageJson.sideEffects, ["**/*.css"]);
  assert.deepEqual(packageJson.peerDependenciesMeta["@vooya/vue"], { optional: true });
  assert.deepEqual(packageJson.peerDependenciesMeta["@vooya/react"], { optional: true });
});
