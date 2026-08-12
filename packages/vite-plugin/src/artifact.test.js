import assert from "node:assert/strict";
import test from "node:test";

import { generateArtifactManifest, generateArtifactPackage } from "./artifact.js";

const component = {
  name: "Counter",
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
    generateArtifactManifest({ component, definition, packageName: "@fixture/counter" }),
    {
      schemaVersion: 1,
      artifact: "vooya-component",
      name: "Counter",
      package: "@fixture/counter",
      abiVersion: 1,
      runtime: "./dist/runtime.js",
      wasm: "./dist/runtime_bg.wasm",
      styles: ["./dist/style.css"],
      hosts: { vue: "./dist/vue.js", react: "./dist/react.js" },
      props: definition.props,
      events: definition.events,
    },
  );
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
