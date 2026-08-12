import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, parse, relative, resolve } from "node:path";

import { buildApplication } from "./build-core.mjs";
import {
  generatedAdapterDefinition,
  generatedComponentBinding,
} from "./voo-codegen.js";
import { generateVooDeclaration } from "./voo-declarations.js";
import { parseVooComponent } from "./voo-parser.js";
import { compileVooStyle } from "./voo-style.js";

const pluginPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const ownershipMarker = ".vooya-artifact";

export function buildPrecompiledArtifact({
  source,
  packageName,
  outputDir,
  rust = {},
  version = "0.0.0",
}) {
  if (typeof packageName !== "string" || !packageName) {
    throw new Error("A precompiled artifact requires packageName.");
  }
  if (typeof outputDir !== "string" || !outputDir) {
    throw new Error("A precompiled artifact requires outputDir.");
  }
  const sourcePath = resolve(source);
  let component = {
    ...parseVooComponent(readFileSync(sourcePath, "utf8"), sourcePath),
    id: sourcePath,
    scopeSource: `${packageName}/${basename(sourcePath)}`,
  };
  if (component.format !== "source") {
    throw new Error("A precompiled artifact must be built from a source .voo component.");
  }

  const artifactRoot = resolve(outputDir);
  assertArtifactOutputTarget({ artifactRoot, sourcePath });
  mkdirSync(dirname(artifactRoot), { recursive: true });
  const stagingRoot = mkdtempSync(
    resolve(dirname(artifactRoot), `.${basename(artifactRoot)}.vooya-stage-`),
  );

  try {
    const dist = resolve(stagingRoot, "dist");
    const cacheRoot = resolve(stagingRoot, ".cache");
    mkdirSync(dist, { recursive: true });
    const prepared = prepareArtifactComponent(component);
    component = prepared.component;
    const { compiledStyle, hasStyle } = prepared;

    buildApplication({
      applicationRoot: dirname(sourcePath),
      components: [component],
      rust,
      cacheRoot,
      outputDir: dist,
      outputName: "runtime",
    });

    const definition = generatedAdapterDefinition(component);
    const manifest = generateArtifactManifest({
      component,
      definition,
      packageName,
      hasStyle,
    });
    if (hasStyle) writeFileSync(resolve(dist, "style.css"), `${compiledStyle}\n`);
    for (const framework of ["vue", "react"]) {
      writeFileSync(
        resolve(dist, `${framework}.js`),
        generateArtifactEntry(component, framework, hasStyle),
      );
      writeFileSync(
        resolve(dist, `${framework}.d.ts`),
        generateVooDeclaration(component, framework),
      );
    }
    writeFileSync(
      resolve(stagingRoot, "vooya.manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    writeFileSync(
      resolve(stagingRoot, "package.json"),
      `${JSON.stringify(generateArtifactPackage({ packageName, version, hasStyle }), null, 2)}\n`,
    );
    writeFileSync(
      resolve(stagingRoot, ownershipMarker),
      `${JSON.stringify({ schemaVersion: 1, package: packageName })}\n`,
    );
    rmSync(cacheRoot, { force: true, recursive: true });
    replaceOwnedArtifact(stagingRoot, artifactRoot);
    return { manifest, outputDir: artifactRoot };
  } finally {
    rmSync(stagingRoot, { force: true, recursive: true });
  }
}

export function generateArtifactManifest({ component, definition, packageName, hasStyle }) {
  return {
    schemaVersion: 1,
    artifact: "vooya-component",
    name: component.name,
    package: packageName,
    vooyaVersion: pluginPackage.version,
    abiVersion: definition.abiVersion,
    runtime: "./dist/runtime.js",
    wasm: "./dist/runtime_bg.wasm",
    styles: hasStyle ? ["./dist/style.css"] : [],
    hosts: {
      vue: { entry: "./dist/vue.js", adapterVersion: pluginPackage.version },
      react: { entry: "./dist/react.js", adapterVersion: pluginPackage.version },
    },
    props: definition.props,
    events: definition.events,
  };
}

export function prepareArtifactComponent(component) {
  const compiledStyle = compileVooStyle(component);
  const hasStyle = Boolean(compiledStyle);
  return {
    component: hasStyle ? component : { ...component, style: undefined },
    compiledStyle,
    hasStyle,
  };
}

export function generateArtifactPackage({ packageName, version, hasStyle }) {
  return {
    name: packageName,
    version,
    type: "module",
    files: ["dist", "vooya.manifest.json"],
    sideEffects: hasStyle ? ["**/*.css"] : false,
    exports: {
      "./vue": { types: "./dist/vue.d.ts", import: "./dist/vue.js" },
      "./react": { types: "./dist/react.d.ts", import: "./dist/react.js" },
      "./manifest": "./vooya.manifest.json",
    },
    peerDependencies: {
      "@vooya/react": pluginPackage.version,
      "@vooya/vue": pluginPackage.version,
    },
    peerDependenciesMeta: {
      "@vooya/react": { optional: true },
      "@vooya/vue": { optional: true },
    },
  };
}

export function generateArtifactEntry(component, framework, hasStyle = Boolean(component.style)) {
  const { exportName, disposeName, updateNames } = generatedComponentBinding(component);
  const definition = generatedAdapterDefinition(component);
  const adapter = framework === "react" ? "@vooya/react" : "@vooya/vue";
  const exports = [exportName, disposeName, ...Object.values(updateNames), "voo_abi_version"];
  return `${hasStyle ? 'import "./style.css";\n' : ""}import init, { ${exports.join(", ")} } from "./runtime.js";
import { defineVooyaComponent } from ${JSON.stringify(adapter)};

const expectedAbiVersion = ${definition.abiVersion};
let bindings;
async function loadBindings() {
  if (!bindings) {
    bindings = init().then(() => {
      const actual = voo_abi_version();
      if (actual !== expectedAbiVersion) {
        throw new Error(\`Vooya ABI mismatch: artifact expects \${expectedAbiVersion}, but WASM provides \${String(actual)}.\`);
      }
      return {
        mount(host, ...props) {
          const handle = ${exportName}(host, ...props);
          return {
            dispose() { ${disposeName}(handle); },
            ${Object.entries(updateNames)
              .map(([prop, name]) => `update_${prop}(value) { ${name}(handle, value); }`)
              .join(",\n            ")}
          };
        }
      };
    });
  }
  return bindings;
}

export const metadata = ${JSON.stringify(definition)};
export default defineVooyaComponent(metadata, loadBindings);
`;
}

export function assertArtifactOutputTarget({ artifactRoot, sourcePath }) {
  const target = resolve(artifactRoot);
  const source = resolve(sourcePath);
  const forbidden = new Set([parse(target).root, resolve(homedir()), resolve(process.cwd())]);
  if (forbidden.has(target)) {
    throw new Error(`Refusing to write a precompiled artifact to unsafe outputDir ${target}.`);
  }
  const sourceWithinTarget = relative(target, source);
  if (sourceWithinTarget === "" || (!sourceWithinTarget.startsWith("..") && !parse(sourceWithinTarget).root)) {
    throw new Error(`Refusing to replace outputDir ${target} because it contains the source component.`);
  }
  if (existsSync(target) && !existsSync(resolve(target, ownershipMarker))) {
    throw new Error(
      `Refusing to replace existing outputDir ${target} because it is not owned by Vooya.`,
    );
  }
}

export function replaceOwnedArtifact(stagingRoot, artifactRoot) {
  if (!existsSync(artifactRoot)) {
    renameSync(stagingRoot, artifactRoot);
    return;
  }
  const backup = resolve(
    dirname(artifactRoot),
    `.${basename(artifactRoot)}.vooya-backup-${process.pid}-${Date.now()}`,
  );
  renameSync(artifactRoot, backup);
  try {
    renameSync(stagingRoot, artifactRoot);
  } catch (error) {
    renameSync(backup, artifactRoot);
    throw error;
  }
  rmSync(backup, { force: true, recursive: true });
}
