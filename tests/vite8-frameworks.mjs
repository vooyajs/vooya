// Install each host outside the workspace's Vite 7 dependency graph.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = process.argv[2] ?? "vite8";
if (!["vite8", "vite-plus"].includes(target)) throw new Error(`Unknown target: ${target}`);
const plus = target === "vite-plus";
const label = plus ? "Vite+ 0.2.9" : "Vite 8.2.1";
const frameworks = plus ? ["vue", "react", "solid", "svelte", "octane"] : ["solid", "svelte"];
const temporary = mkdtempSync(resolve(tmpdir(), `vooya-${target}-frameworks-`));
try {
  mkdirSync(resolve(temporary, "packages"));
  const common = ["compiler", "core", "build-core", "vite"];
  const packages = new Map([...common, ...frameworks].map((name) => {
    const packed = run("npm", ["pack", "--workspace", `@vooya/${name}`, "--pack-destination", resolve(temporary, "packages"), "--json"], root, {}, true);
    return [name, resolve(temporary, "packages", JSON.parse(packed)[0].filename)];
  }));
  for (const framework of frameworks) {
    const project = resolve(temporary, framework);
    cpSync(resolve(root, `tests/fixtures/rust-${framework}`), project, { recursive: true, filter: (path) => !["node_modules", ".vooya", "dist"].includes(path.split(/[\\/]/).at(-1)) });
    const path = resolve(project, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.devDependencies.vite = plus ? "npm:@voidzero-dev/vite-plus-core@0.2.9" : "8.2.1";
    manifest.devDependencies.typescript ??= "~5.5.4";
    if (framework === "svelte") manifest.devDependencies["@sveltejs/vite-plugin-svelte"] = "7.1.2";
    if (framework === "react") manifest.devDependencies["@types/react"] = "^19.0.0";
    if (plus) {
      manifest.devDependencies["vite-plus"] = "0.2.9";
      manifest.overrides = { vite: "npm:@voidzero-dev/vite-plus-core@0.2.9", vitest: "4.1.10" };
      manifest.scripts.build = "vp build";
      const config = resolve(project, "vite.config.js");
      writeFileSync(config, readFileSync(config, "utf8").replace('from "vite"', 'from "vite-plus"'));
    }
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    run("npm", ["install", "--prefer-offline", "--ignore-scripts", "--no-audit", "--no-fund", ...[...common, framework].map((name) => packages.get(name))], project);
    run(process.execPath, ["--input-type=module", "-e", 'import { version } from "vite"; if (!version.startsWith("8.")) throw new Error(`Expected Vite 8 core, received ${version}`); console.log(`Installed Vite core: ${version}`);'], project);
    const environment = { VOOYA_RUST_FIXTURE_ROOT: project, ...(plus ? { VOOYA_VITE_PLUS: "1" } : {}) };
    run(process.execPath, [resolve(root, `tests/rust-${framework}-source.mjs`)], root, environment);
    verifyDeclarations(project, framework);
    if (plus) run(process.execPath, [resolve(root, "tests/rust-hmr.mjs"), framework], root, environment);
    console.log(`Verified packed ${label} ${framework}: production browser, strict declarations${plus ? ", dev reload and Rust error recovery" : ""}.`);
  }
} finally {
  if (!process.env.VOOYA_KEEP_VITE8_FRAMEWORKS) rmSync(temporary, { recursive: true, force: true });
  else console.log(`Kept fixtures: ${temporary}`);
}

function verifyDeclarations(project, framework) {
  const readSnapshot = {
    vue: 'const count: number | undefined = state.value?.count;',
    react: 'const count: number | undefined = state?.count;',
    solid: 'const count: number | undefined = state()?.count;',
    svelte: 'state.subscribe((snapshot) => { const count: number | undefined = snapshot?.count; });',
    octane: 'const count: number | undefined = state?.count;',
  };
  writeFileSync(resolve(project, "tsconfig.contract.json"), JSON.stringify({ compilerOptions: {
    target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true,
    noEmit: true, skipLibCheck: false, allowArbitraryExtensions: true,
    rootDirs: [".", ".vooya/types"], types: [],
    ...(framework === "octane" ? { jsx: "preserve", jsxImportSource: "octane" } : {}),
  }, include: ["src/type-probe.ts"] }, null, 2));
  writeFileSync(resolve(project, "src/type-probe.ts"), `import { useCart } from "./Store.rs";
import Counter from "./Counter.rs";
const { state, add } = useCart();
${readSnapshot[framework]}
add(1);
// @ts-expect-error Rust action takes a number.
add("invalid");
void Counter;
`);
  run(process.execPath, [resolve(project, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.contract.json"], project);
}

function run(command, args, cwd, env = {}, capture = false) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", stdio: capture ? "pipe" : "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr ?? result.status}`);
  return result.stdout;
}
