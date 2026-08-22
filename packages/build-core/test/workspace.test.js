import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  cleanVooyaWorkspace,
  ensureVooyaWorkspace,
  resolveVooyaWorkspace,
  writeRustSchemaDeclarations,
  writeVooDeclarations,
} from "../dist/workspace.js";

function component(id, name = "Counter") {
  return {
    format: "source",
    id,
    name,
    props: [],
    events: [],
    rust: { content: "pub struct Component;", startLine: 1 },
  };
}

test("resolves the disposable .vooya workspace layout", () => {
  const root = resolve("/project");
  assert.deepEqual(resolveVooyaWorkspace(root), {
    root: resolve(root, ".vooya"),
    build: resolve(root, ".vooya/build"),
    wasm: resolve(root, ".vooya/wasm"),
    types: resolve(root, ".vooya/types"),
    cache: resolve(root, ".vooya/cache"),
    metadata: resolve(root, ".vooya/metadata.json"),
  });
  assert.throws(() => resolveVooyaWorkspace(root, "."), /dedicated directory/);
});

test("writes mirrored declarations, removes stale output, and avoids source pollution", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-workspace-"));
  try {
    const first = resolve(root, "src/one/Counter.voo");
    const second = resolve(root, "src/two/Counter.voo");
    mkdirSync(resolve(first, "../"), { recursive: true });
    mkdirSync(resolve(second, "../"), { recursive: true });
    writeFileSync(first, "component");
    writeFileSync(second, "component");
    writeFileSync(first.replace(/\.voo$/, ".d.voo.ts"), "legacy");

    const written = writeVooDeclarations({
      applicationRoot: root,
      components: [component(first), component(second)],
      framework: "vue",
    });
    const firstDeclaration = resolve(root, ".vooya/types/src/one/Counter.d.voo.ts");
    const secondDeclaration = resolve(root, ".vooya/types/src/two/Counter.d.voo.ts");
    assert.deepEqual(written.files, [firstDeclaration, secondDeclaration]);
    assert.equal(existsSync(first.replace(/\.voo$/, ".d.voo.ts")), false);
    assert.match(readFileSync(firstDeclaration, "utf8"), /DefineComponent/);
    const modified = statSync(firstDeclaration).mtimeMs;

    writeVooDeclarations({
      applicationRoot: root,
      components: [component(first)],
      framework: "vue",
    });
    assert.equal(statSync(firstDeclaration).mtimeMs, modified);
    assert.equal(existsSync(secondDeclaration), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("rebuilds an incompatible generated workspace and clean preserves unknown files", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-workspace-"));
  try {
    const paths = resolveVooyaWorkspace(root);
    mkdirSync(paths.build, { recursive: true });
    writeFileSync(resolve(paths.build, "old.txt"), "old");
    writeFileSync(paths.metadata, '{"product":"vooya","schemaVersion":0}\n');
    ensureVooyaWorkspace(paths);
    assert.equal(existsSync(resolve(paths.build, "old.txt")), false);
    assert.equal(JSON.parse(readFileSync(paths.metadata, "utf8")).schemaVersion, 1);

    writeFileSync(resolve(paths.root, "keep.txt"), "not generated");
    cleanVooyaWorkspace(root);
    assert.equal(existsSync(resolve(paths.root, "keep.txt")), true);
    assert.equal(existsSync(paths.metadata), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("writes Rust-file declarations under the central workspace", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-workspace-"));
  try {
    const source = resolve(root, "src/components/Cart.rs");
    mkdirSync(resolve(source, "../"), { recursive: true });
    writeFileSync(source, "// component");
    const written = writeRustSchemaDeclarations({
      applicationRoot: root,
      framework: "vue",
      contracts: [{
        component: { version: 1, kind: "component", id: "cart::Cart", name: "Cart", group: "src/components/Cart.rs", params: [] },
        props: { version: 1, kind: "props", id: "cart::Props", name: "Props", group: "src/components/Cart.rs", fields: [{ name: "total", type: "u128" }] },
      }],
    });
    const declaration = resolve(root, ".vooya/types/src/components/Cart.d.rs.ts");
    assert.deepEqual(written.files, [declaration]);
    assert.match(readFileSync(declaration, "utf8"), /total: bigint/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("writes React store exports into the central declaration", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-workspace-"));
  try {
    const source = resolve(root, "src/Store.rs");
    mkdirSync(resolve(source, "../"), { recursive: true });
    writeFileSync(source, "// store");
    const written = writeRustSchemaDeclarations({
      applicationRoot: root,
      framework: "react",
      contracts: [],
      stores: [{
        version: 1,
        kind: "store",
        id: "cart::Cart",
        name: "Cart",
        group: "src/Store.rs",
        snapshot: "CartSnapshot",
        actions: [{ name: "add", params: [{ name: "amount", type: "u32" }] }],
      }],
    });
    const declaration = resolve(root, ".vooya/types/src/Store.d.rs.ts");
    assert.deepEqual(written.files, [declaration]);
    const code = readFileSync(declaration, "utf8");
    assert.match(code, /createCartStore/);
    assert.match(code, /useCart\(options\?: VooyaStoreOptions\)/);
    assert.doesNotMatch(code, /CartSnapshot = CartSnapshot/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
