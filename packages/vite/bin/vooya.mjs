#!/usr/bin/env node
import { formatToolchainReport, inspectToolchain } from "../dist/doctor.js";
import { cleanVooyaWorkspace } from "@vooya/build-core";

const parsed = parseDoctorArguments(process.argv.slice(2));
if (parsed.help) {
  console.log(usage());
} else if (parsed.error) {
  console.error(parsed.error);
  console.error(usage());
  process.exitCode = 1;
} else if (parsed.command === "clean") {
  const workspace = cleanVooyaWorkspace(process.cwd(), parsed.workspaceRoot);
  console.log(`Removed generated Vooya state from ${workspace.root}.`);
} else {
  const report = inspectToolchain({
    cargoPath: parsed.cargoPath,
    workspaceRoot: parsed.workspaceRoot,
    mode: parsed.mode,
  });
  console.log(parsed.json ? JSON.stringify(report, null, 2) : formatToolchainReport(report));
  if (!report.ok) process.exitCode = 1;
}

export function parseDoctorArguments(args) {
  if (args[0] === "--help" || args[0] === "-h") return { help: true };
  if (args[0] !== "doctor" && args[0] !== "clean") return { error: "Unknown command." };

  let cargoPath;
  let workspaceRoot;
  let mode = "source";
  let json = false;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--mode") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return { error: "--mode requires a mode." };
      if (!["source", "system", "precompiled", "managed"].includes(value)) return { error: `Unknown mode: ${value}` };
      mode = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--mode=")) {
      const value = argument.slice("--mode=".length);
      if (!["source", "system", "precompiled", "managed"].includes(value)) return { error: `Unknown mode: ${value}` };
      mode = value;
      continue;
    }
    if (argument === "--cargo-path") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return { error: "--cargo-path requires a path." };
      if (cargoPath !== undefined) return { error: "--cargo-path may be specified only once." };
      cargoPath = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--cargo-path=")) {
      const value = argument.slice("--cargo-path=".length);
      if (!value) return { error: "--cargo-path requires a path." };
      if (cargoPath !== undefined) return { error: "--cargo-path may be specified only once." };
      cargoPath = value;
      continue;
    }
    if (argument === "--workspace-root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return { error: "--workspace-root requires a path." };
      if (workspaceRoot !== undefined) return { error: "--workspace-root may be specified only once." };
      workspaceRoot = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--workspace-root=")) {
      const value = argument.slice("--workspace-root=".length);
      if (!value) return { error: "--workspace-root requires a path." };
      if (workspaceRoot !== undefined) return { error: "--workspace-root may be specified only once." };
      workspaceRoot = value;
      continue;
    }
    return { error: `Unknown argument: ${argument}` };
  }
  if (args[0] === "clean" && cargoPath !== undefined) {
    return { error: "--cargo-path is only available for vooya doctor." };
  }
  return { command: args[0], cargoPath, workspaceRoot, mode, json };
}

function usage() {
  return [
    "Usage:",
    "  vooya doctor [--mode source|system|precompiled|managed] [--json] [--cargo-path <path>] [--workspace-root <path>]",
    "  vooya clean [--workspace-root <path>]",
  ].join("\n");
}
