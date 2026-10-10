module.exports = function vooyaRustLoader() {
  // A real source adapter must emit provider-generated WASM into the production
  // graph. This call is intentionally the documented API boundary under test.
  this.emitFile("vooya-generated.wasm", "placeholder");
  return "export default function RustIsland() { return null; }";
};
