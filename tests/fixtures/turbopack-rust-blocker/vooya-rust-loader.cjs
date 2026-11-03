module.exports = function vooyaRustEmitFileSentinelLoader() {
  // A real source adapter must emit provider-generated WASM into the production
  // graph. This call is intentionally the documented API boundary under test.
  this.emitFile("vooya-rust-blocker-sentinel.wasm", "placeholder");
  return "export default function RustIsland() { return null; }";
};
