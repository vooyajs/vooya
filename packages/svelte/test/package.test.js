import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("ships the Svelte component source and typed adapter entry", () => {
  assert.equal(existsSync(new URL("../dist/VooyaHost.svelte", import.meta.url)), true);
  const declaration = readFileSync(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /defineVooyaComponent/);
  assert.match(declaration, /Readable<TSnapshot \| undefined>/);
});
