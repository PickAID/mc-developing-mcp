import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Loader } from "minecraft-developing-mcp-shared-types";

import type { WorkspaceScan } from "./filesystem.js";
import type { CollectedRuntimeFact } from "./runtime.js";
import { dedupeFacts } from "./runtime.js";

const FORGE_COORDINATE_PATTERN =
  /net\.minecraftforge:forge:([0-9]+\.[0-9]+(?:\.[0-9]+)?)-([A-Za-z0-9+_.-]+)/;
const NEOFORGE_COORDINATE_PATTERN =
  /net\.neoforged:neoforge:([0-9]+\.[0-9]+(?:\.[0-9]+)?)-([A-Za-z0-9+_.-]+)/;
const NEOFORGE_VERSION_ONLY_PATTERN =
  /net\.neoforged:neoforge:([0-9]+\.[0-9]+(?:\.[0-9]+)?)/;
const MINECRAFT_VERSION_PATTERN =
  /(?:^|\b)(?:minecraft(?:_version|Version)?|mcVersion)\s*[:=]\s*["']?([0-9]+\.[0-9]+(?:\.[0-9]+)?)/im;
const FORGE_PLUGIN_PATTERN = /net\.minecraftforge\.gradle/;
const NEOFORGE_PLUGIN_PATTERN = /net\.neoforged\.(?:gradle\.userdev|moddev)/;
const FABRIC_PLUGIN_PATTERN = /fabric-loom/;
const QUILT_PLUGIN_PATTERN = /org\.quiltmc\.loom/;

const GRADLE_AUXILIARY_FILES = [
  "gradle.properties",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle/libs.versions.toml"
] as const;

export async function collectGradleFacts(
  scan: WorkspaceScan
): Promise<CollectedRuntimeFact[]> {
  const candidates = uniquePaths([
    ...scan.buildFiles,
    ...GRADLE_AUXILIARY_FILES.map((relativePath) => join(scan.root, relativePath))
  ]);

  const factGroups = await Promise.all(
    candidates.map(async (filePath) => scanGradleFile(filePath))
  );

  return dedupeFacts(factGroups.flat());
}

async function scanGradleFile(filePath: string): Promise<CollectedRuntimeFact[]> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }

  return scanGradleText(filePath, text);
}

function scanGradleText(filePath: string, text: string): CollectedRuntimeFact[] {
  const facts: CollectedRuntimeFact[] = [];

  const forgeCoordinate = text.match(FORGE_COORDINATE_PATTERN);
  if (forgeCoordinate) {
    facts.push({
      minecraftVersion: forgeCoordinate[1],
      loader: "forge",
      loaderVersion: forgeCoordinate[2],
      weight: "high",
      sourcePath: filePath,
      kind: "gradle-dependency",
      detail: "forge dependency coordinate",
      value: forgeCoordinate[0]
    });
  }

  const neoforgeCoordinate = text.match(NEOFORGE_COORDINATE_PATTERN);
  if (neoforgeCoordinate) {
    facts.push({
      minecraftVersion: neoforgeCoordinate[1],
      loader: "neoforge",
      loaderVersion: neoforgeCoordinate[2],
      weight: "high",
      sourcePath: filePath,
      kind: "gradle-dependency",
      detail: "neoforge dependency coordinate",
      value: neoforgeCoordinate[0]
    });
  } else {
    const neoforgeVersionOnly = text.match(NEOFORGE_VERSION_ONLY_PATTERN);
    if (neoforgeVersionOnly) {
      const loaderVersion = neoforgeVersionOnly[1];
      facts.push({
        minecraftVersion: minecraftVersionFromNeoForgeLoader(loaderVersion),
        loader: "neoforge",
        loaderVersion,
        weight: "medium",
        sourcePath: filePath,
        kind: "gradle-dependency",
        detail: "neoforge dependency coordinate without explicit minecraft version",
        value: neoforgeVersionOnly[0]
      });
    }
  }

  const versionMatch = text.match(MINECRAFT_VERSION_PATTERN);
  const minecraftVersion = versionMatch?.[1];
  if (minecraftVersion) {
    facts.push({
      minecraftVersion,
      weight: "high",
      sourcePath: filePath,
      kind: "gradle-property",
      detail: "explicit minecraft version property",
      value: versionMatch[0]
    });
  }

  const loader = detectGradleLoader(text);
  if (loader) {
    facts.push({
      loader,
      weight: "medium",
      sourcePath: filePath,
      kind: "gradle-plugin",
      detail: "loader plugin identifier",
      value: loader
    });
    if (minecraftVersion) {
      facts.push({
        minecraftVersion,
        loader,
        weight: "high",
        sourcePath: filePath,
        kind: "gradle-combined",
        detail: "loader and explicit minecraft version in same gradle file",
        value: `${minecraftVersion}|${loader}`
      });
    }
  }

  return facts;
}

function detectGradleLoader(text: string): Loader | undefined {
  if (NEOFORGE_PLUGIN_PATTERN.test(text) || text.includes("net.neoforged:neoforge:")) {
    return "neoforge";
  }
  if (FORGE_PLUGIN_PATTERN.test(text) || text.includes("net.minecraftforge:forge:")) {
    return "forge";
  }
  if (QUILT_PLUGIN_PATTERN.test(text)) {
    return "quilt";
  }
  if (FABRIC_PLUGIN_PATTERN.test(text)) {
    return "fabric";
  }
  return undefined;
}

function minecraftVersionFromNeoForgeLoader(loaderVersion: string): string | undefined {
  const major = loaderVersion.split(".")[0];
  switch (major) {
    case "21":
      return "1.21.1";
    default:
      return undefined;
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}
