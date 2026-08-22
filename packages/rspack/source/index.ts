// This package has no bundled Rspack runtime dependency. It uses Rspack's
// public plugin and loader protocols and is currently verified against 2.1.10.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildApplication,
  resolveVooyaWorkspace,
  writeVooDeclarations,
} from "@vooya/build-core";
import type { BuildApplicationResult, RustBuildOptions } from "@vooya/build-core";
import { parseVooComponent } from "@vooya/compiler";
import type { SourceComponent } from "@vooya/compiler";

import { deleteBuildState, getBuildState, setBuildState } from "./state.js";

const loaderPath = fileURLToPath(new URL("./loader.js", import.meta.url));
const ignoredDirectories = new Set([".git", ".vooya", "dist", "node_modules", "target"]);
let nextInstance = 0;

export interface VooyaRspackOptions {
  framework?: "vue" | "react";
  rust?: RustBuildOptions;
  workspaceRoot?: string;
}

export interface VooyaRspackRule {
  test: RegExp;
  loader: string;
  options: {
    framework: "vue" | "react";
    instanceId: string;
  };
}

interface RspackCompilationLike {
  errors: Error[];
  emitAsset(name: string, source: unknown): void;
}

interface RspackCompilerLike {
  context: string;
  options: { mode?: string };
  rspack: { sources: { RawSource: new (value: unknown) => unknown } };
  hooks: {
    beforeCompile: {
      tapPromise(name: string, callback: () => Promise<void>): void;
    };
    thisCompilation: {
      tap(name: string, callback: (compilation: RspackCompilationLike) => void): void;
    };
    watchClose: {
      tap(name: string, callback: () => void): void;
    };
  };
}

interface RspackPluginLike {
  apply(compiler: unknown): void;
}

interface RspackConfigLike {
  plugins?: RspackPluginLike[];
  module?: { rules?: VooyaRspackRule[] };
}

interface RsbuildApiLike {
  modifyRspackConfig(callback: (config: RspackConfigLike) => RspackConfigLike): void;
  onBeforeStartDevServer(
    callback: (context: { server: RsbuildDevServerLike }) => void,
  ): void;
  onAfterDevCompile(
    callback: (context: { isFirstCompile: boolean; stats: RspackStatsLike }) => void,
  ): void;
  onCloseDevServer(callback: () => void): void;
}

interface RsbuildDevServerLike {
  sockWrite(type: "full-reload", data?: { path?: string }): void;
}

interface RspackStatsLike {
  hasErrors(): boolean;
}

export interface VooyaRsbuildPlugin {
  name: string;
  setup(api: RsbuildApiLike): void;
}

export function vooyaRspack(options: VooyaRspackOptions = {}): VooyaRspackPlugin {
  return new VooyaRspackPlugin(options);
}

export class VooyaRspackPlugin implements RspackPluginLike {
  framework: "vue" | "react";
  rust: RustBuildOptions;
  workspaceRoot?: string;
  instanceId: string;
  buildError?: Error;
  buildId?: string;

  constructor({
    framework = "vue",
    rust = {},
    workspaceRoot,
  }: VooyaRspackOptions = {}) {
    if (framework !== "vue" && framework !== "react") throw new Error(`Unknown Vooya framework ${framework}.`);
    this.framework = framework;
    this.rust = rust;
    this.workspaceRoot = workspaceRoot;
    this.instanceId = `vooya-rspack-${nextInstance++}`;
    this.buildError = undefined;
    this.buildId = undefined;
  }

  rule(): VooyaRspackRule {
    return {
      test: /\.voo$/,
      loader: loaderPath,
      options: { framework: this.framework, instanceId: this.instanceId },
    };
  }

  apply(input: unknown): void {
    const compiler = input as RspackCompilerLike;
    compiler.hooks.beforeCompile.tapPromise("vooya", async () => {
      try {
        const applicationRoot = compiler.context;
        const components = readVooComponents(applicationRoot);
        const workspace = resolveVooyaWorkspace(applicationRoot, this.workspaceRoot);
        const workspacePath = resolve(workspace.build, "rspack");
        const result = buildApplication({
          applicationRoot,
          components,
          rust: this.rust,
          workspaceRoot: workspace.root,
          workspacePath,
          outputDir: resolve(workspace.wasm, "rspack"),
          buildMode: compiler.options.mode === "development" ? "development" : "production",
          framework: this.framework,
        });
        writeVooDeclarations({
          applicationRoot,
          components,
          framework: this.framework,
          workspaceRoot: workspace.root,
        });
        const styleModules = writeGeneratedFiles({
          components,
          result,
          stylesRoot: resolve(workspace.cache, "rspack/styles"),
        });
        const buildId = createHash("sha256").update(result.wasm.bytes).digest("hex").slice(0, 16);
        const versionedRuntime = writeVersionedRuntime(result, buildId);
        this.buildId = buildId;
        setBuildState(this.instanceId, {
          // wasm-bindgen's JavaScript is often byte-for-byte stable across
          // Rust edits. Give both it and its WASM child content-addressed file
          // identities so Rspack cannot retain an older module graph.
          runtimeModule: versionedRuntime.runtimeModule,
          wasm: result.wasm.bytes,
          wasmAssetName: versionedRuntime.wasmAssetName,
          styleModules,
        });
        this.buildError = undefined;
      } catch (error) {
        // A rejected `beforeCompile` promise stops Rspack's watch cycle after
        // a Rust error. Preserve the last good build state and surface the
        // failure on this compilation instead, so the next source edit can
        // rebuild and recover without restarting the dev server.
        this.buildError = error instanceof Error ? error : new Error(String(error));
      }
    });
    compiler.hooks.thisCompilation.tap("vooya", (compilation) => {
      if (this.buildError) compilation.errors.push(this.buildError);
      const state = getBuildState(this.instanceId);
      if (!state) return;
      // wasm-bindgen's web target references `vooya_app_bg.wasm` relative to
      // its JavaScript module. Rsbuild discovers that asset itself, while
      // Rslib's bundled-library path does not; registering it here gives both
      // paths a loadable, deterministic emitted asset.
      compilation.emitAsset(
        state.wasmAssetName,
        new compiler.rspack.sources.RawSource(Buffer.from(state.wasm)),
      );
    });
    compiler.hooks.watchClose.tap("vooya", () => {
      deleteBuildState(this.instanceId);
      this.buildId = undefined;
    });
  }

  currentBuildId(): string | undefined {
    return this.buildId;
  }
}

export function vooyaRsbuild(options: VooyaRspackOptions = {}): VooyaRsbuildPlugin {
  const plugin = vooyaRspack(options);
  let devServer: RsbuildDevServerLike | undefined;
  let deliveredBuildId: string | undefined;
  return {
    name: "vooya-rsbuild",
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins ??= [];
        config.plugins.push(plugin);
        config.module ??= {};
        config.module.rules ??= [];
        config.module.rules.push(plugin.rule());
        return config;
      });
      api.onBeforeStartDevServer(({ server }) => {
        devServer = server;
      });
      api.onCloseDevServer(() => {
        devServer = undefined;
        deliveredBuildId = undefined;
      });
      api.onAfterDevCompile(({ isFirstCompile, stats }) => {
        const buildId = plugin.currentBuildId();
        if (isFirstCompile) {
          deliveredBuildId = buildId;
          return;
        }
        if (buildId && buildId !== deliveredBuildId && !stats.hasErrors()) {
          deliveredBuildId = buildId;
          // Rsbuild exposes an explicit dev-server reload channel. Use it for
          // rebuilt WASM so behavior does not depend on platform-specific HMR
          // inference for generated wasm-bindgen modules.
          devServer?.sockWrite("full-reload", { path: "*" });
        }
      });
    },
  };
}

type PreparedSourceComponent = SourceComponent & { id: string };

function readVooComponents(root: string): PreparedSourceComponent[] {
  return readVooFiles(root).map((id) => {
    const component = parseVooComponent(readFileSync(id, "utf8"), id);
    component.id = id;
    return component;
  }).filter((component): component is PreparedSourceComponent => component.format === "source");
}

function readVooFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...readVooFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".voo")) files.push(path);
  }
  return files;
}

function writeVersionedRuntime(
  result: BuildApplicationResult,
  buildId: string,
): { runtimeModule: string; wasmAssetName: string } {
  const outputDirectory = dirname(result.runtimeModule);
  const runtimeModule = resolve(outputDirectory, `vooya_app-${buildId}.js`);
  const wasmAssetName = `vooya_app_bg-${buildId}.wasm`;
  const runtimeCode = result.javascript.code.replace(
    /(["'])vooya_app_bg\.wasm\1/g,
    JSON.stringify(wasmAssetName),
  );
  if (runtimeCode === result.javascript.code) {
    throw new Error("Vooya could not version the wasm-bindgen WASM reference for Rspack.");
  }
  writeFileSync(runtimeModule, runtimeCode);
  writeFileSync(resolve(outputDirectory, wasmAssetName), result.wasm.bytes);
  return { runtimeModule, wasmAssetName };
}

function writeGeneratedFiles({
  components,
  result,
  stylesRoot,
}: {
  components: PreparedSourceComponent[];
  result: BuildApplicationResult;
  stylesRoot: string;
}): Map<string, string> {
  const styles = new Map<string, string>();
  const css = new Map(result.css.map((style) => [style.componentId, style.code]));
  for (const [index, component] of components.entries()) {
    const style = css.get(component.id);
    if (style === undefined) continue;
    const stylePath = resolve(stylesRoot, `${index}-${component.name}.css`);
    mkdirSync(dirname(stylePath), { recursive: true });
    writeIfChanged(stylePath, style);
    styles.set(component.id, stylePath);
  }
  return styles;
}

function writeIfChanged(path: string, content: string): void {
  try {
    if (readFileSync(path, "utf8") === content) return;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
