// Keep Vite 8 and the framework plugins outside the workspace's Vite 7 graph.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(resolve(tmpdir(), "vooya-vite8-frameworks-"));
try {
  mkdirSync(resolve(temporary, "packages"));
  const packages = ["compiler", "core", "build-core", "vite", "solid", "svelte"].map((name) => {
    const packed = run("npm", ["pack", "--workspace", `@vooya/${name}`, "--pack-destination", resolve(temporary, "packages"), "--json"], root, {}, true);
    return resolve(temporary, "packages", JSON.parse(packed)[0].filename);
  });
  for (const framework of ["solid", "svelte"]) {
    const project = resolve(temporary, framework);
    cpSync(resolve(root, `tests/fixtures/rust-${framework}`), project, { recursive: true, filter: (path) => !["node_modules", ".vooya", "dist"].includes(path.split(/[\\/]/).at(-1)) });
    const path = resolve(project, "package.json");
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.devDependencies.vite = "8.2.1";
    manifest.devDependencies.typescript = "~5.5.4";
    if (framework === "svelte") manifest.devDependencies["@sveltejs/vite-plugin-svelte"] = "7.1.2";
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    run("npm", ["install", "--prefer-offline", "--ignore-scripts", "--no-audit", "--no-fund", ...packages], project);
    run(process.execPath, [resolve(root, `tests/rust-${framework}-source.mjs`)], root, { VOOYA_RUST_FIXTURE_ROOT: project });
    writeFileSync(resolve(project, "tsconfig.json"), JSON.stringify({ compilerOptions: {
      target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true,
      noEmit: true, skipLibCheck: false, allowArbitraryExtensions: true,
      rootDirs: [".", ".vooya/types"], types: [],
    }, include: ["src/type-probe.ts"] }, null, 2));
    writeFileSync(resolve(project, "src/type-probe.ts"), `import { useCart } from "./Store.rs";
import Counter from "./Counter.rs";
const { state, add } = useCart();
${framework === "solid" ? 'const count: number | undefined = state()?.count;' : 'state.subscribe((snapshot) => { const count: number | undefined = snapshot?.count; });'}
add(1);
// @ts-expect-error Rust action takes a number.
add("invalid");
void Counter;
`);
    run(process.execPath, [resolve(project, "node_modules/typescript/bin/tsc"), "--project", "tsconfig.json"], project);
    console.log(`Verified packed Vite 8 ${framework} production browser and strict generated declarations.`);
  }
} finally {
  if (!process.env.VOOYA_KEEP_VITE8_FRAMEWORKS) rmSync(temporary, { recursive: true, force: true });
  else console.log(`Kept fixtures: ${temporary}`);
}
function run(command, args, cwd, env = {}, capture = false) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr ?? result.status}`);
  return result.stdout;
}
