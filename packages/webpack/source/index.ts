// This package accesses Webpack structurally so it has no runtime dependency
// on a specific Webpack 5 minor. The supported boundary is verified separately.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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
const ignoredDirectories = new Set([
  ".git",
  ".voo-cache",
  ".vooya",
  "dist",
  "node_modules",
  "target",
]);
let nextInstance = 0;

export interface VooyaWebpackOptions {
  framework?: "vue" | "react";
  rust?: RustBuildOptions;
  workspaceRoot?: string;
}

export interface VooyaWebpackRule {
  test: RegExp;
  use: Array<{
    loader: string;
    options: {
      framework: "vue" | "react";
      instanceId: string;
    };
  }>;
}

interface WebpackCompilationLike {
  errors: Error[];
  contextDependencies: Set<string>;
}

interface WebpackCompilerLike {
  context: string;
  watchMode?: boolean;
  modifiedFiles?: ReadonlySet<string>;
  options: {
    mode?: string;
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
  readonly framework: "vue" | "react";
  readonly rust: RustBuildOptions;
  readonly workspaceRoot?: string;
  readonly instanceId: string;
  private buildError?: Error;
  private needsBuild = true;
  private generation = 0;

  constructor({
    framework = "vue",
    rust = {},
    workspaceRoot,
  }: VooyaWebpackOptions = {}) {
    if (framework !== "vue" && framework !== "react") {
      throw new Error(`Unknown Vooya framework ${framework}.`);
    }
    this.framework = framework;
    this.rust = rust;
    this.workspaceRoot = workspaceRoot;
    this.instanceId = `vooya-webpack-${nextInstance++}`;
  }

  rule(): VooyaWebpackRule {
    return {
      test: /\.voo$/,
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
    compiler.hooks.watchRun.tap("vooya", (watchCompiler) => {
      const modifiedFiles = watchCompiler.modifiedFiles ?? new Set();
      const watchedRoots = getBuildState(this.instanceId)?.watchedRoots ?? [];
      if (
        [...modifiedFiles].some(
          (path) => path.endsWith(".voo") || watchedRoots.some((root) => isPathInside(path, root)),
        )
      ) {
        this.needsBuild = true;
      }
    });
    compiler.hooks.beforeCompile.tapPromise("vooya", async () => {
      if (!this.needsBuild) return;
      try {
        this.build(compiler);
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
        compilation.contextDependencies.add(root);
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
      rust: this.rust,
      workspaceRoot: workspace.root,
      workspacePath: resolve(workspace.build, "webpack"),
      outputDir: resolve(workspace.wasm, "webpack", generation),
      buildMode: compiler.options.mode === "development" ? "development" : "production",
      framework: this.framework,
    });
    writeVooDeclarations({
      applicationRoot,
      components,
      framework: this.framework,
      workspaceRoot: workspace.root,
    });
    setBuildState(this.instanceId, {
      runtimeModule: result.runtimeModule,
      styleModules: writeGeneratedStyles({
        applicationRoot,
        components,
        result,
        stylesRoot: resolve(workspace.cache, "webpack/styles"),
      }),
      watchedRoots: result.watchedFiles,
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

function isPathInside(path: string, directory: string): boolean {
  const nested = relative(resolve(directory), resolve(path));
  return (
    nested === "" ||
    (!isAbsolute(nested) && nested !== ".." && !nested.startsWith("../") && !nested.startsWith("..\\"))
  );
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
