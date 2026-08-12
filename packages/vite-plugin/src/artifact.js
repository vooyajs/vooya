import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

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
  const component = {
    ...parseVooComponent(readFileSync(sourcePath, "utf8"), sourcePath),
    id: sourcePath,
    scopeSource: `${packageName}/${basename(sourcePath)}`,
  };
  if (component.format !== "source") {
    throw new Error("A precompiled artifact must be built from a source .voo component.");
  }

  const artifactRoot = resolve(outputDir);
  const dist = resolve(artifactRoot, "dist");
  const cacheRoot = resolve(artifactRoot, ".cache");
  rmSync(artifactRoot, { force: true, recursive: true });
  mkdirSync(dist, { recursive: true });

  buildApplication({
    applicationRoot: dirname(sourcePath),
    components: [component],
    rust,
    cacheRoot,
    outputDir: dist,
    outputName: "runtime",
  });

  const definition = generatedAdapterDefinition(component);
  const manifest = generateArtifactManifest({ component, definition, packageName });
  const style = compileVooStyle(component);
  if (style) writeFileSync(resolve(dist, "style.css"), `${style}\n`);
  for (const framework of ["vue", "react"]) {
    writeFileSync(resolve(dist, `${framework}.js`), generateArtifactEntry(component, framework));
    writeFileSync(
      resolve(dist, `${framework}.d.ts`),
      generateVooDeclaration(component, framework),
    );
  }
  writeFileSync(
    resolve(artifactRoot, "vooya.manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    resolve(artifactRoot, "package.json"),
    `${JSON.stringify(generateArtifactPackage({ packageName, version, hasStyle: Boolean(style) }), null, 2)}\n`,
  );
  rmSync(cacheRoot, { force: true, recursive: true });
  return { manifest, outputDir: artifactRoot };
}

export function generateArtifactManifest({ component, definition, packageName }) {
  return {
    schemaVersion: 1,
    artifact: "vooya-component",
    name: component.name,
    package: packageName,
    abiVersion: definition.abiVersion,
    runtime: "./dist/runtime.js",
    wasm: "./dist/runtime_bg.wasm",
    styles: component.style ? ["./dist/style.css"] : [],
    hosts: {
      vue: "./dist/vue.js",
      react: "./dist/react.js",
    },
    props: definition.props,
    events: definition.events,
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

function generateArtifactEntry(component, framework) {
  const { exportName, disposeName, updateNames } = generatedComponentBinding(component);
  const definition = generatedAdapterDefinition(component);
  const adapter = framework === "react" ? "@vooya/react" : "@vooya/vue";
  const exports = [exportName, disposeName, ...Object.values(updateNames), "voo_abi_version"];
  return `${component.style ? 'import "./style.css";\n' : ""}import init, { ${exports.join(", ")} } from "./runtime.js";
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
