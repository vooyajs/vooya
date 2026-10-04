import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ReleaseChannel = "alpha" | "beta";
export interface ReleaseLine {
  baseVersion: string;
  channel: ReleaseChannel;
  branch: string;
}

/** Missing configuration preserves historical release rehearsals. */
export function readReleaseLine(root: string): ReleaseLine | undefined {
  const path = resolve(root, ".changeset/line.json");
  if (!existsSync(path)) return undefined;
  const line = JSON.parse(readFileSync(path, "utf8"));
  if (!line || typeof line !== "object" || Array.isArray(line)
    || Object.keys(line).sort().join(",") !== "baseVersion,branch,channel"
    || typeof line.baseVersion !== "string" || !/^0\.[1-9]\d*\.0$/.test(line.baseVersion)
    || !["alpha", "beta"].includes(line.channel)
    || typeof line.branch !== "string" || !validBranch(line.branch)) {
    throw new Error("Invalid release line: expected { baseVersion: '0.x.0', channel: 'alpha' | 'beta', branch: '<git branch>' }.");
  }
  const pre = JSON.parse(readFileSync(resolve(root, ".changeset/pre.json"), "utf8"));
  if (pre.mode !== "pre" || pre.tag !== line.channel) throw new Error("Release line channel must match active Changesets prerelease mode.");
  return line;
}

function validBranch(branch: string): boolean {
  return branch.length > 0 && branch !== "@" && !branch.startsWith("-")
    && !/[\s\x00-\x20\x7f~^:?*\[\\]/.test(branch)
    && !branch.includes("..") && !branch.includes("@{")
    && branch.split("/").every((part) => part && !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock"));
}

export function readReleaseChannel(root: string): ReleaseChannel {
  const pre = JSON.parse(readFileSync(resolve(root, ".changeset/pre.json"), "utf8"));
  if (pre.mode !== "pre" || (pre.tag !== "alpha" && pre.tag !== "beta")) throw new Error("Publication requires Changesets prerelease mode with an alpha or beta channel; stable publication is not enabled.");
  readReleaseLine(root);
  return pre.tag;
}

export function validateReleaseVersion(version: unknown, channel: ReleaseChannel, line?: ReleaseLine): version is string {
  if (typeof version !== "string") return false;
  if (line) {
    if (line.channel !== channel) return false;
    const prefix = `${line.baseVersion}-${channel}.`;
    return version.startsWith(prefix) && /^(0|[1-9]\d*)$/.test(version.slice(prefix.length));
  }
  if (channel === "beta") return /^0\.1\.0-beta\.(0|[1-9]\d*)$/.test(version);
  if (channel === "alpha") return /^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)-alpha\.(0|[1-9]\d*)$/.test(version);
  return false;
}
