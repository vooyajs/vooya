import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { readVooComponents } from "../dist/voo-project.js";

test("does not scan the generated workspace for components", () => {
  const root = mkdtempSync(resolve(tmpdir(), "vooya-project-"));
  try {
    mkdirSync(resolve(root, "src"));
    mkdirSync(resolve(root, ".vooya/types"), { recursive: true });
    writeFileSync(
      resolve(root, "src/Counter.voo"),
      '<component name="Counter"></component>\n<rust>\npub struct Component;\n</rust>\n',
    );
    writeFileSync(resolve(root, ".vooya/types/Generated.voo"), "not a component");

    const components = readVooComponents(root);

    assert.equal(components.length, 1);
    assert.equal(components[0].name, "Counter");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
