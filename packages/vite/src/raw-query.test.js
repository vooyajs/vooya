import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { build, createServer } from "vite";
import { vooya } from "../dist/index.js";

// Exercise the real Vite resolver, asset loader, and glob transform. Raw source
// does not need the Rust build lifecycle; retain Vooya's actual module hooks.
function sourcePlugin() {
  const { name, enforce, resolveId, load } = vooya();
  return { name, enforce, resolveId, load };
}

test("Vite preserves Rust and Voo source strings for direct and glob raw imports", async () => {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), "vooya-raw-query-")));
  const rust = "// source shown in the editor\npub struct WorkflowReplay;\n";
  const voo = "<component name=\"Example\">\n</component>\n";
  writeFileSync(resolve(root, "WorkflowReplay.rs"), rust);
  writeFileSync(resolve(root, "Example.voo"), voo);
  writeFileSync(resolve(root, "entry.js"), `
    import direct from './WorkflowReplay.rs?raw';
    import aliased from '@source/WorkflowReplay.rs?raw';
    import combined from './WorkflowReplay.rs?import&raw';
    import reversed from './WorkflowReplay.rs?raw&import';
    export { direct, aliased, combined, reversed };
    export const sources = import.meta.glob('./*.{rs,voo}', {
      eager: true, import: 'default', query: '?raw',
    });
  `);
  const config = {
    configFile: false, root, logLevel: "silent", plugins: [sourcePlugin()],
    resolve: { alias: { '@source': root } },
  };
  let server;
  try {
    server = await createServer({ ...config, server: { middlewareMode: true } });
    const imported = await server.ssrLoadModule('/entry.js');
    for (const name of ['direct', 'aliased', 'combined', 'reversed']) assert.equal(imported[name], rust);
    assert.deepEqual(imported.sources, { './Example.voo': voo, './WorkflowReplay.rs': rust });
    const response = await server.transformRequest('/WorkflowReplay.rs?raw');
    assert.match(response.code, /export default "\/\/ source shown/);
    const result = await build({ ...config, build: {
      write: false, minify: false, lib: { entry: resolve(root, 'entry.js'), formats: ['es'] },
    } });
    const output = (Array.isArray(result) ? result[0] : result).output.find((item) => item.type === 'chunk');
    const production = await import(`data:text/javascript;base64,${Buffer.from(output.code).toString('base64')}`);
    assert.equal(production.direct, rust);
    assert.equal(production.aliased, rust);
    assert.equal(production.combined, rust);
    assert.equal(production.reversed, rust);
    assert.deepEqual(production.sources, { './Example.voo': voo, './WorkflowReplay.rs': rust });
  } finally {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
