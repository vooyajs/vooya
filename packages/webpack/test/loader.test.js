import assert from "node:assert/strict";
import test from "node:test";
import loader from "../dist/loader.js";

const source = `<component name="Counter">\nprops:\n  initial: i32\n\nevents:\n  changed(value: i32)\n</component>\n\n<rust>\npub fn mount(_context: Context) -> Result<Component, wasm_bindgen::JsValue> { Ok(Component {}) }\npub struct Component {}\nimpl Component { pub fn dispose(&mut self) {} pub fn update_initial(&self, _value: i32) {} }\n</rust>\n\n<style scoped>\n.counter { color: red; }\n</style>\n`;

test("loader only produces a framework module from the plugin build result", () => {
  const generated = loader.call({ resourcePath: "/consumer/src/Counter.voo", rootContext: "/tmp/vooya-webpack-loader", _compilation: { __vooyaBuild: { runtimeModule: "/tmp/vooya_app.js" } }, getOptions: () => ({ framework: "vue" }) }, source);
  assert.match(generated, /from "\/tmp\/vooya_app\.js"/);
  assert.match(generated, /@vooya\/vue/);
  assert.match(generated, /@vooya\/webpack\/runtime/);
});

test("loader rejects execution without the application plugin", () => {
  assert.throws(() => loader.call({ resourcePath: "/consumer/src/Counter.voo", rootContext: "/consumer" }, source), /not initialized/);
});

test("loader selects the React adapter without starting another build", () => {
  const generated = loader.call({ resourcePath: "/consumer/src/Counter.voo", rootContext: "/tmp/vooya-webpack-loader", _compilation: { __vooyaBuild: { runtimeModule: "/tmp/vooya_app.js" } }, getOptions: () => ({ framework: "react" }) }, source);
  assert.match(generated, /@vooya\/react/);
  assert.match(generated, /from "\/tmp\/vooya_app\.js"/);
});
