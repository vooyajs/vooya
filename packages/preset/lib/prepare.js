import { prepareToolchain } from "./index.js";
try {
  const result = await prepareToolchain();
  // Only tool-selection fields cross the subprocess boundary. Do not serialize
  // the inherited environment (which can contain application credentials).
  const keys = ["CARGO_HOME", "RUSTUP_HOME", "RUSTUP_TOOLCHAIN", "RUSTC", "RUSTC_WRAPPER", "RUSTC_WORKSPACE_WRAPPER", "PATH"];
  console.log(JSON.stringify({ ...result, environment: Object.fromEntries(keys.map(key => [key, result.environment[key] ?? null])) }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
