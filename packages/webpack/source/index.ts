// This package accesses Webpack structurally so it has no runtime dependency
// on a specific Webpack 5 minor. The supported boundary is verified separately.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildApplication,
  prepareRustModules,
  rustInputFingerprint,
  resolveVooyaWorkspace,
  resolveToolchain,
  writeVooDeclarations,
} from "@vooya/build-core";
import type { BuildApplicationResult, RustBuildOptions } from "@vooya/build-core";
import { parseVooComponent } from "@vooya/compiler";
import type { SourceComponent } from "@vooya/compiler";

import { deleteBuildState, getBuildState, setBuildState } from "./state.js";

const loaderPath = fileURLToPath(new URL("./loader.js", import.meta.url));
const ignoredDirectories = new Set([
  ".git",
  ".vooya",
  "dist",
  "node_modules",
  "target",
]);
let nextInstance = 0;

export interface VooyaWebpackOptions {
  framework?: "vue" | "react" | "solid" | "svelte";
  rust?: RustBuildOptions;
  workspaceRoot?: string;
  toolchain?: { cargoPath?: string; mode?: "auto" | "system" | "managed" };
}

export interface VooyaWebpackRule {
  test: RegExp;
  use: Array<{
    loader: string;
    options: {
      framework: "vue" | "react" | "solid" | "svelte";
      instanceId: string;
    };
  }>;
}

interface WebpackCompilationLike {
  errors: Error[];
  contextDependencies: Set<string>;
  fileDependencies: Set<string>;
}

interface WebpackCompilerLike {
  context: string;
  watchMode?: boolean;
  modifiedFiles?: ReadonlySet<string>;
  options: {
    mode?: string;
    output?: { path?: string };
    devServer?: { liveReload?: boolean };
  };
  hooks: {
    watchRun: {
      tap(name: string, callback: (compiler: WebpackCompilerLike) => void): void;
    };
    beforeCompile: {
      tapPromise(name: string, callback: () => Promise<void>): void;
    };
    thisCompilation: {
      tap(name: string, callback: (compilation: WebpackCompilationLike) => void): void;
    };
    watchClose: {
      tap(name: string, callback: () => void): void;
    };
  };
}

interface WebpackPluginLike {
  apply(compiler: unknown): void;
}

export function vooyaWebpack(options: VooyaWebpackOptions = {}): VooyaWebpackPlugin {
  return new VooyaWebpackPlugin(options);
}

export class VooyaWebpackPlugin implements WebpackPluginLike {
  readonly framework: "vue" | "react" | "solid" | "svelte";
  readonly rust: RustBuildOptions;
  readonly workspaceRoot?: string;
  readonly toolchain?: VooyaWebpackOptions["toolchain"];
  readonly instanceId: string;
  private buildError?: Error;
  private needsBuild = true;
  private inputFingerprint?: string;
  private generation = 0;

  constructor({
    framework = "vue",
    rust = {},
    workspaceRoot,
    toolchain,
  }: VooyaWebpackOptions = {}) {
    if (!["vue", "react", "solid", "svelte"].includes(framework)) {
      throw new Error(`Unknown Vooya framework ${framework}.`);
    }
    this.framework = framework;
    this.rust = rust;
    this.workspaceRoot = workspaceRoot;
    this.toolchain = toolchain;
    this.instanceId = `vooya-webpack-${nextInstance++}`;
  }

  rule(): VooyaWebpackRule {
    return {
      test: /\.(voo|rs)$/,
      use: [
        {
          loader: loaderPath,
          options: { framework: this.framework, instanceId: this.instanceId },
        },
      ],
    };
  }

  apply(input: unknown): void {
    const compiler = input as WebpackCompilerLike;
    compiler.hooks.watchRun.tap("vooya", () => {
      const state = getBuildState(this.instanceId);
      if (!state) return;
      this.needsBuild = Boolean(this.buildError) || rustInputFingerprint(state.watchedRoots, state.workspaceRoot, compiler.options.output?.path) !== this.inputFingerprint;
    });
    compiler.hooks.beforeCompile.tapPromise("vooya", async () => {
      if (!this.needsBuild) return;
      const state = getBuildState(this.instanceId);
      // Cargo compiles a source snapshot. Never acknowledge edits made while it
      // runs by sampling inputs after the build. New dependencies get a baseline
      // on the next watch pass, once their pre-build state is known.
      const inputFingerprint = state
        ? rustInputFingerprint(state.watchedRoots, state.workspaceRoot, compiler.options.output?.path)
        : undefined;
      try {
        this.build(compiler);
        this.inputFingerprint = inputFingerprint;
        this.needsBuild = false;
        this.buildError = undefined;
      } catch (error) {
        // Rejecting beforeCompile terminates Webpack watch. Preserve the last
        // good state and surface this attempt as a compilation diagnostic so a
        // later source edit can recover without restarting the dev server.
        this.buildError = error instanceof Error ? error : new Error(String(error));
      }
    });
    compiler.hooks.thisCompilation.tap("vooya", (compilation) => {
      if (this.buildError) compilation.errors.push(this.buildError);
      for (const root of getBuildState(this.instanceId)?.watchedRoots ?? []) {
        (statSync(root, { throwIfNoEntry: false })?.isDirectory() ? compilation.contextDependencies : compilation.fileDependencies).add(root);
      }
    });
    compiler.hooks.watchClose.tap("vooya", () => {
      deleteBuildState(this.instanceId);
      this.needsBuild = true;
      this.buildError = undefined;
    });
    if (compiler.options.devServer) compiler.options.devServer.liveReload ??= true;
  }

  private build(compiler: WebpackCompilerLike): void {
    const applicationRoot = compiler.context;
    const components = readVooComponents(applicationRoot);
    const workspace = resolveVooyaWorkspace(applicationRoot, this.workspaceRoot);
    const generation = String(++this.generation);
    const result = buildApplication({
      applicationRoot,
      components,
      toolchain: resolveToolchain({ cwd: applicationRoot, ...this.toolchain }),
      rust: this.rust,
      workspaceRoot: workspace.root,
      workspacePath: resolve(workspace.build, "webpack"),
      outputDir: resolve(workspace.wasm, "webpack", generation),
      buildMode: compiler.options.mode === "development" ? "development" : "production",
      framework: this.framework,
    });
    const generationFile = resolve(workspace.cache, "webpack", `${this.instanceId}.generation`);
    writeIfChanged(generationFile, `${generation}\n`);
    writeVooDeclarations({
      applicationRoot,
      components,
      framework: this.framework,
      workspaceRoot: workspace.root,
    });
    const rustModules = components.length === 0 ? prepareRustModules({
      applicationRoot, workspaceRoot: workspace.root, schema: result.schema,
      framework: this.framework, runtimeModule: result.runtimeModule,
      runtimeHelpers: "@vooya/webpack/runtime", stylesRoot: resolve(workspace.cache, "webpack/rust-styles"),
    }) : { modules: new Map<string, string>(), dependencies: [] };
    setBuildState(this.instanceId, {
      runtimeModule: result.runtimeModule,
      workspaceRoot: workspace.root,
      rustModules: rustModules.modules,
      generationFile,
      styleModules: writeGeneratedStyles({
        applicationRoot,
        components,
        result,
        stylesRoot: resolve(workspace.cache, "webpack/styles"),
      }),
      watchedRoots: [...result.watchedFiles, ...components.map((component) => component.id), ...rustModules.dependencies],
    });
  }
}

type PreparedSourceComponent = SourceComponent & { id: string };

function readVooComponents(root: string): PreparedSourceComponent[] {
  return readVooFiles(root)
    .map((id) => {
      const component = parseVooComponent(readFileSync(id, "utf8"), id);
      component.id = id;
      return component;
    })
    .filter((component): component is PreparedSourceComponent => component.format === "source");
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

function writeGeneratedStyles({
  applicationRoot,
  components,
  result,
  stylesRoot,
}: {
  applicationRoot: string;
  components: PreparedSourceComponent[];
  result: BuildApplicationResult;
  stylesRoot: string;
}): Map<string, string> {
  const styles = new Map<string, string>();
  const css = new Map(result.css.map((style) => [style.componentId, style.code]));
  for (const component of components) {
    const style = css.get(component.id);
    if (style === undefined) continue;
    const identity = createHash("sha256")
      .update(relative(applicationRoot, component.id))
      .digest("hex")
      .slice(0, 16);
    const stylePath = resolve(stylesRoot, `${identity}-${component.name}.css`);
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
