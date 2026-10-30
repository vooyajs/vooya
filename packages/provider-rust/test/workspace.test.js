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
  resolveRustSchemaGroup,
  writeRustSchemaDeclarations,
} from "../dist/workspace.js";

function contract(id) {
  return { component: { version: 1, kind: "component", id, name: "Counter", group: id, params: [] },
    props: { version: 1, kind: "props", id: id + "::Props", name: "CounterProps", group: id, fields: [] } };
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
    const first = resolve(root, "src/one/Counter.rs");
    const second = resolve(root, "src/two/Counter.rs");
    mkdirSync(resolve(first, "../"), { recursive: true });
    mkdirSync(resolve(second, "../"), { recursive: true });
    writeFileSync(first, "component");
    writeFileSync(second, "component");
    writeFileSync(first.replace(/\.rs$/, ".d.rs.ts"), "user-authored declaration");

    const written = writeRustSchemaDeclarations({
      applicationRoot: root,
      contracts: [contract(first), contract(second)],
      framework: "vue",
    });
    const firstDeclaration = resolve(root, ".vooya/types/src/one/Counter.d.rs.ts");
    const secondDeclaration = resolve(root, ".vooya/types/src/two/Counter.d.rs.ts");
    assert.deepEqual(written.files, [firstDeclaration, secondDeclaration]);
    assert.equal(readFileSync(first.replace(/\.rs$/, ".d.rs.ts"), "utf8"), "user-authored declaration");
    assert.match(readFileSync(firstDeclaration, "utf8"), /DefineComponent/);
    const modified = statSync(firstDeclaration).mtimeMs;

    writeRustSchemaDeclarations({
      applicationRoot: root,
      contracts: [contract(first)],
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


test("resolves sourceRoot dot schema groups with normalized paths", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-schema-dot-"));
  try {
    const source = resolve(root, "Counter.rs");
    writeFileSync(source, "// authored Rust");
    for (const group of ["rust/./Counter.rs", "src/rust/./Counter.rs", "rust/unused/../Counter.rs", "rust\\.\\Counter.rs"]) {
      assert.equal(resolveRustSchemaGroup(root, group), source);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("separate artifacts retain their type graphs and reject duplicate source ownership before writes", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-artifact-types-"));
  try {
    for (const name of ["light", "heavy"]) {
      mkdirSync(resolve(root, "src", name), {recursive:true});
      writeFileSync(resolve(root, "src", name, "Store.rs"), "// authored source");
    }
    const artifact = (name, scalar) => ({ contracts: [], stores: [{
      version:2, kind:"store", id:"Counter", name:"Counter", group:`src/${name}/Store.rs`, actions:[],
      snapshot:"Snapshot", snapshotAbi:{kind:"named", identity:"app::store::Snapshot", direction:"to"},
    }], types:[{ version:2, kind:"type", id:"Snapshot", name:"Snapshot", identity:"app::store::Snapshot", direction:"to",
      shape:{kind:"struct", fields:[{name:"value", type:scalar, abi:{kind:"scalar", name:scalar}}]},
    }] });
    const light = artifact("light", "u32");
    const heavy = artifact("heavy", "String");
    const input = {applicationRoot:root, contracts:[], framework:"vue", artifacts:[light,heavy]};
    const written = writeRustSchemaDeclarations(input);
    assert.equal(written.files.length, 2);
    const lightPath = resolve(root, ".vooya/types/src/light/Store.d.rs.ts");
    const heavyPath = resolve(root, ".vooya/types/src/heavy/Store.d.rs.ts");
    assert.match(readFileSync(lightPath,"utf8"), /value: number/);
    assert.match(readFileSync(heavyPath,"utf8"), /value: string/);
    const previous = readFileSync(lightPath,"utf8");
    assert.throws(() => writeRustSchemaDeclarations({...input, artifacts:[artifact("light","bool"),light]}), /Multiple Rust exports/);
    assert.equal(readFileSync(lightPath,"utf8"), previous);
    assert.ok(existsSync(heavyPath));
  } finally { rmSync(root, {recursive:true,force:true}); }
});
