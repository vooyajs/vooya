export interface WebpackBuildState {
  runtimeModule: string;
  generationFile: string;
  styleModules: Map<string, string>;
  watchedRoots: string[];
}

const states = new Map<string, WebpackBuildState>();

export function setBuildState(id: string, state: WebpackBuildState): void {
  states.set(id, state);
}

export function getBuildState(id: string): WebpackBuildState | undefined {
  return states.get(id);
}

export function deleteBuildState(id: string): void {
  states.delete(id);
}
