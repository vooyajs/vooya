import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const playwright = fileURLToPath(
  new URL("../../node_modules/@playwright/test/cli.js", import.meta.url),
);

for (const target of ["vue", "react", "tasks", "benchmark", "scatter", "trace", "rsx"]) {
  const result = spawnSync(process.execPath, [playwright, "test"], {
    stdio: "inherit",
    env: { ...process.env, VOOYA_E2E_TARGET: target },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
