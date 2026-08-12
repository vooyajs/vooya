import { defineConfig } from "@playwright/test";

const targets = {
  vue: {
    command: "npm run dev:vue -- --host 127.0.0.1 --port 4174",
    test: "vue-counter.spec.js",
    url: "http://127.0.0.1:4174",
  },
  react: {
    command: "npm run dev:react -- --host 127.0.0.1 --port 4175",
    test: "react-counter.spec.js",
    url: "http://127.0.0.1:4175",
  },
  tasks: {
    command: "npm run dev:tasks -- --host 127.0.0.1 --port 4176",
    test: "task-list.spec.js",
    url: "http://127.0.0.1:4176",
  },
  benchmark: {
    command: "npm run dev:benchmark -- --host 127.0.0.1 --port 4177",
    test: "data-grid.spec.js",
    url: "http://127.0.0.1:4177",
  },
  parity: {
    test: "host-parity.spec.js",
    webServer: [
      {
        command: "npm run dev:vue -- --host 127.0.0.1 --port 4174",
        url: "http://127.0.0.1:4174",
      },
      {
        command: "npm run dev:react -- --host 127.0.0.1 --port 4175",
        url: "http://127.0.0.1:4175",
      },
    ],
  },
};

const targetName = process.env.VOOYA_E2E_TARGET ?? "vue";
const target = targets[targetName];
if (!target) throw new Error(`Unknown VOOYA_E2E_TARGET "${targetName}".`);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: target.test,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: target.url,
    trace: "retain-on-failure",
  },
  webServer: (target.webServer ?? [{ command: target.command, url: target.url }]).map(
    (server) => ({ ...server, reuseExistingServer: false, timeout: 120_000 }),
  ),
});
