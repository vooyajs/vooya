// Build the tarball prerequisite without assuming runner-provided Rust. This
// setup cache is distinct from the consumer's independently prepared cache.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareToolchain } from "../packages/preset/lib/index.js";
import { resolveToolchain } from "../packages/build-core/dist/index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const cacheDirectory = resolve(process.env.VOOYA_PRESET_SETUP_CACHE_DIR || join(tmpdir(), "vooya-preset-test-setup"));
const prepared = await prepareToolchain({ cacheDirectory });
// The root is a publisher workspace, not the user app. Select the explicitly
// prepared environment here; auto-discovery is tested separately in the app.
const env = { ...prepared.environment, VOOYA_TOOLCHAIN: "system" };
const toolchain = resolveToolchain({ cwd: root, env });
assert.equal(toolchain.cargo.path, prepared.cargoPath);
assert.ok(toolchain.rustc.path.startsWith(cacheDirectory));
assert.ok(toolchain.wasmBindgen.path.startsWith(cacheDirectory));
const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "--workspace", "@vooya/core"], {
  cwd: root, env, stdio: "inherit", shell: process.platform === "win32",
});
if (result.error) throw result.error;
assert.equal(result.status, 0, "core tarball prerequisite must build with the prepared preset toolchain");
console.log("Built core prerequisite with the separate preset setup toolchain.");
