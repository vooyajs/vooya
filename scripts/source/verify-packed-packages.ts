// npm pack JSON is external process output and is validated at runtime.
// @ts-nocheck
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const expectedPackages = [
  "@vooya/compiler",
  "@vooya/core",
  "@vooya/build-core",
  "@vooya/vite-plugin",
  "@vooya/vue",
  "@vooya/react",
  "@vooya/webpack",
];
const license = "MIT OR Apache-2.0";
const repositoryUrl = "git+https://github.com/vooyajs/vooya.git";
const mitLicense = readFileSync(new URL("../../LICENSE-MIT", import.meta.url), "utf8");
const apacheLicense = readFileSync(new URL("../../LICENSE-APACHE", import.meta.url), "utf8");

assert(mitLicense.includes("MIT License"), "repository", "LICENSE-MIT must contain the MIT license text");
assert(apacheLicense.includes("Apache License"), "repository", "LICENSE-APACHE must contain the Apache-2.0 license text");

const packDirectory = mkdtempSync(join(tmpdir(), "vooya-pack-check-"));

try {
  const packedPackages = new Map();
  for (const name of expectedPackages) {
    const manifest = readManifest(name);
    const packed = pack(name);
    packedPackages.set(name, packed);
    const files = new Set(packed.files.map(({ path }) => path));

    assert(files.has("package.json"), name, "archive is missing package.json");
    assert(manifest.license === license, name, `license must be ${license}`);
    assert(manifest.repository?.type === "git", name, "repository type must be git");
    assert(manifest.repository?.url === repositoryUrl, name, `repository URL must be ${repositoryUrl}`);
    assert(manifest.repository?.directory === `packages/${name.replace("@vooya/", "")}`, name, "repository directory must identify this package");
    assert(manifest.publishConfig?.access === "public", name, "publishConfig.access must be public");
    assert(files.has("LICENSE-MIT"), name, "archive is missing MIT license text");
    assert(files.has("LICENSE-APACHE"), name, "archive is missing Apache-2.0 license text");
    assert(readArchiveFile(packed.archivePath, "package/LICENSE-MIT") === mitLicense, name, "packed MIT license text must match the canonical root copy");
    assert(readArchiveFile(packed.archivePath, "package/LICENSE-APACHE") === apacheLicense, name, "packed Apache-2.0 license text must match the canonical root copy");
    for (const target of exportTargets(manifest.exports)) {
      assert(files.has(target), name, `archive is missing exported file ${target}`);
    }
    for (const [subpath, definition] of Object.entries(manifest.exports ?? {})) {
      if (!definition || typeof definition !== "object" || !("import" in definition)) continue;
      assert(typeof definition.import === "string" && definition.import.endsWith(".js"), name, `${subpath} must export executable JavaScript`);
      assert(typeof definition.types === "string" && definition.types.endsWith(".d.ts"), name, `${subpath} must export TypeScript declarations`);
      assert(files.has(stripPrefix(definition.import)), name, `archive is missing JavaScript for ${subpath}`);
      assert(files.has(stripPrefix(definition.types)), name, `archive is missing declarations for ${subpath}`);
    }

    if (name === "@vooya/core") {
      assert(files.has("dist/vooya_app_bg.wasm"), name, "archive is missing runtime WASM");
      assert(files.has("dist/vooya_app.d.ts"), name, "archive is missing runtime types");
    }
    if (name === "@vooya/compiler") {
      assert(files.has("dist/index.js"), name, "archive is missing compiler JavaScript");
      assert(files.has("dist/index.d.ts"), name, "archive is missing compiler types");
    }
    if (name === "@vooya/build-core") {
      assert(files.has("dist/index.js"), name, "archive is missing build-core JavaScript");
      assert(files.has("dist/index.d.ts"), name, "archive is missing build-core types");
    }
    if (name === "@vooya/vite-plugin") {
      for (const file of [
        "dist/index.d.ts",
        "dist/build-core.d.ts",
        "dist/voo-format.d.ts",
        "dist/runtime.d.ts",
      ]) {
        assert(files.has(file), name, `archive is missing public plugin types ${file}`);
      }
    }
    if (name === "@vooya/vue" || name === "@vooya/react") {
      assert(files.has("dist/index.js"), name, "archive is missing adapter JavaScript");
      assert(files.has("dist/index.d.ts"), name, "archive is missing adapter types");
    }
    if (name === "@vooya/webpack") {
      for (const file of ["dist/index.js", "dist/index.d.ts", "dist/loader.js", "dist/loader.d.ts", "dist/runtime.js", "dist/runtime.d.ts"]) {
        assert(files.has(file), name, `archive is missing Webpack integration file ${file}`);
      }
    }
    for (const file of files) {
      assert(!file.includes("VOOYA_COLLABORATION_LOG"), name, `archive leaks internal collaboration file ${file}`);
      assert(!file.includes("VOOYA_PRODUCT_OPERATING_PLAN"), name, `archive leaks internal planning file ${file}`);
      assert(!file.includes("/source/") && (!file.endsWith(".ts") || file.endsWith(".d.ts")), name, `archive must contain compiled JavaScript rather than TypeScript authoring source ${file}`);
    }

    console.log(`Verified ${name}@${packed.version}: ${files.size} archive files.`);
  }
  verifyTypeConsumer(packedPackages);
} finally {
  rmSync(packDirectory, { force: true, recursive: true });
}

function verifyTypeConsumer(packedPackages) {
  const consumer = join(packDirectory, "type-consumer");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({
      private: true,
      type: "module",
      dependencies: Object.fromEntries(
        expectedPackages.map((name) => [name, `file:${packedPackages.get(name).archivePath}`]),
      ),
      devDependencies: {
        typescript: "~5.5.4",
        vite: "^7.0.0",
      },
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
      },
      include: ["consumer.ts"],
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(consumer, "consumer.ts"),
    `import { parseVooComponent } from "@vooya/compiler";
import { vooya } from "@vooya/vite-plugin";
import { buildApplication } from "@vooya/build-core";
import { buildPrecompiledVueArtifact } from "@vooya/vite-plugin/build";
import { formatVooComponent } from "@vooya/vite-plugin/format";
import { assertVooAbiVersion, initializeWasm } from "@vooya/vite-plugin/runtime";
import { vooyaWebpack } from "@vooya/webpack";

void parseVooComponent;
void vooya;
void buildApplication;
void buildPrecompiledVueArtifact;
void formatVooComponent;
void assertVooAbiVersion;
void initializeWasm;
void vooyaWebpack;
`,
  );

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const install = spawnSync(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"], {
    cwd: consumer,
    encoding: "utf8",
  });
  if (install.status !== 0) {
    throw new Error(`packed type consumer install failed:\n${install.stderr || install.stdout}`);
  }
  const tsc = join(consumer, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  const typecheck = spawnSync(tsc, ["--project", "tsconfig.json"], { cwd: consumer, encoding: "utf8" });
  if (typecheck.status !== 0) {
    throw new Error(`packed type consumer failed:\n${typecheck.stderr || typecheck.stdout}`);
  }
  console.log("Verified packed compiler and Vite plugin declarations in a clean TypeScript consumer.");
}

function readManifest(name) {
  const directory = name.replace("@vooya/", "");
  return JSON.parse(readFileSync(join(root, "packages", directory, "package.json"), "utf8"));
}

function pack(name) {
  const result = spawnSync("npm", ["pack", "--json", "--pack-destination", packDirectory, "--workspace", name], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${name}: npm pack --dry-run failed:\n${result.stderr || result.stdout}`);
  }
  const archives = JSON.parse(result.stdout);
  assert(archives.length === 1, name, `expected one archive, received ${archives.length}`);
  return { ...archives[0], archivePath: join(packDirectory, archives[0].filename) };
}

function readArchiveFile(archivePath, path) {
  const result = spawnSync("tar", ["-xOf", archivePath, path], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`could not read ${path} from ${archivePath}:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function exportTargets(value) {
  if (typeof value === "string") return [stripPrefix(value)];
  if (!value || typeof value !== "object") return [];
  return [...new Set(Object.values(value).flatMap(exportTargets))];
}

function stripPrefix(path) {
  return path.replace(/^\.\//, "");
}

function assert(condition, name, message) {
  if (!condition) throw new Error(`${name}: ${message}`);
}
