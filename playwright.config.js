import { defineConfig, devices } from "@playwright/test";

const requestedPort = process.env.VOOYA_E2E_PORT;

function portFor(defaultPort) {
  if (requestedPort === undefined) return defaultPort;
  if (!/^\d+$/.test(requestedPort)) {
    throw new Error(`Invalid VOOYA_E2E_PORT "${requestedPort}".`);
  }
  const port = Number(requestedPort);
  if (port < 1 || port > 65_535) {
    throw new Error(`Invalid VOOYA_E2E_PORT "${requestedPort}".`);
  }
  return port;
}

function viteTarget(command, test, defaultPort) {
  const port = portFor(defaultPort);
  return {
    command: `${command} -- --host 127.0.0.1 --port ${port}`,
    test,
    url: `http://127.0.0.1:${port}`,
  };
}

const targets = {
  vue: viteTarget("npm run dev:vue", "vue-counter.spec.js", 4174),
  react: viteTarget("npm run dev:react", "react-counter.spec.js", 4175),
  tasks: viteTarget("npm run dev:tasks", "task-list.spec.js", 4176),
  benchmark: viteTarget("npm run dev:benchmark", "data-grid.spec.js", 4177),
  scatter: viteTarget("npm run dev:scatter", "scatter-plot.spec.js", 4178),
  trace: viteTarget("npm run dev:trace", "trace-waterfall.spec.js", 4179),
  rsx: viteTarget("npm run dev:rsx", "rsx-basic.spec.js", 4180),
};

const targetName = process.env.VOOYA_E2E_TARGET ?? "vue";
const target = targets[targetName];
if (!target) throw new Error(`Unknown VOOYA_E2E_TARGET "${targetName}".`);
const browserName = process.env.VOOYA_E2E_BROWSER ?? "chromium";
const browserProjects = {
  chromium: { use: { ...devices["Desktop Chrome"] } },
  firefox: { use: { ...devices["Desktop Firefox"] } },
};
const browserProject = browserProjects[browserName];
if (!browserProject) throw new Error(`Unknown VOOYA_E2E_BROWSER "${browserName}".`);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: target.test,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    ...browserProject.use,
    baseURL: target.url,
    trace: "retain-on-failure",
  },
  webServer: {
    command: target.command,
    url: target.url,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
