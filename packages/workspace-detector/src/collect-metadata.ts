import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { Loader } from "minecraft-developing-mcp-shared-types";

import type { WorkspaceScan } from "./filesystem.js";
import type { CollectedRuntimeFact } from "./runtime.js";
import { dedupeFacts } from "./runtime.js";

const LOADER_VERSION_PATTERN = /loaderVersion\s*=\s*['"]\[(\d+)/;
const VERSION_PATTERN = /([0-9]+\.[0-9]+(?:\.[0-9]+)?)/;

export async function collectMetadataFacts(
  scan: WorkspaceScan
): Promise<CollectedRuntimeFact[]> {
  const metadataPaths = uniquePaths([
    join(scan.root, "pack.mcmeta"),
    ...scan.resourceRoots.flatMap((resourceRoot) => [
      join(resourceRoot, "META-INF", "mods.toml"),
      join(resourceRoot, "META-INF", "neoforge.mods.toml"),
      join(resourceRoot, "fabric.mod.json"),
      join(resourceRoot, "quilt.mod.json"),
      join(resourceRoot, "pack.mcmeta")
    ])
  ]);

  const factGroups = await Promise.all(
    metadataPaths.map(async (filePath) => scanMetadataFile(filePath))
  );

  return dedupeFacts(factGroups.flat());
}

async function scanMetadataFile(filePath: string): Promise<CollectedRuntimeFact[]> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
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

  switch (basename(filePath)) {
    case "mods.toml":
      return [createTomlFact(filePath, content, "forge")];
    case "neoforge.mods.toml":
      return [createTomlFact(filePath, content, "neoforge")];
    case "fabric.mod.json":
      return scanJsonDependencyMetadata(filePath, content, "fabric");
    case "quilt.mod.json":
      return scanJsonDependencyMetadata(filePath, content, "quilt");
    case "pack.mcmeta":
      return scanPackMcmeta(filePath, content);
    default:
      return [];
  }
}

function createTomlFact(
  filePath: string,
  text: string,
  loader: Loader
): CollectedRuntimeFact {
  const loaderVersion = parseLoaderVersion(text);
  const minecraftVersion =
    loader === "forge"
      ? minecraftVersionFromForgeMajor(loaderVersion)
      : minecraftVersionFromNeoForgeMajor(loaderVersion);
  const weight = minecraftVersion ? "high" : "medium";

  return {
    minecraftVersion,
    loader,
    loaderVersion,
    weight,
    sourcePath: filePath,
    kind: loader === "forge" ? "mods-toml" : "neoforge-mods-toml",
    detail: `${loader} mods metadata`,
    value: text.trim()
  };
}

function scanJsonDependencyMetadata(
  filePath: string,
  text: string,
  loader: Loader
): CollectedRuntimeFact[] {
  try {
    const payload = JSON.parse(text) as {
      depends?: Record<string, unknown>;
      quilt_loader?: { depends?: Array<Record<string, unknown>> };
    };

    const version =
      loader === "quilt"
        ? extractQuiltMinecraftVersion(payload.quilt_loader?.depends ?? [])
        : extractVersion(payload.depends?.minecraft);

    if (!version) {
      return [];
    }

    return [
      {
        minecraftVersion: version,
        loader,
        weight: "high",
        sourcePath: filePath,
        kind: `${loader}-mod-json`,
        detail: `${loader} metadata minecraft dependency`,
        value: version
      }
    ];
  } catch {
    return [];
  }
}

function extractQuiltMinecraftVersion(
  depends: Array<Record<string, unknown>>
): string | undefined {
  for (const entry of depends) {
    if (entry.id === "minecraft") {
      return extractVersion(entry.versions);
    }
  }
  return undefined;
}

function extractVersion(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  return input.match(VERSION_PATTERN)?.[1];
}

function scanPackMcmeta(
  filePath: string,
  text: string
): CollectedRuntimeFact[] {
  try {
    const payload = JSON.parse(text) as { pack?: { pack_format?: number } };
    const packFormat = payload.pack?.pack_format;
    if (typeof packFormat !== "number") {
      return [];
    }

    const minecraftVersion = minecraftVersionFromPackFormat(packFormat);
    if (!minecraftVersion) {
      return [];
    }

    return [
      {
        minecraftVersion,
        weight: "medium",
        sourcePath: filePath,
        kind: "pack-mcmeta",
        detail: "pack format mapping",
        value: String(packFormat)
      }
    ];
  } catch {
    return [];
  }
}

function parseLoaderVersion(text: string): string | undefined {
  return text.match(LOADER_VERSION_PATTERN)?.[1];
}

function minecraftVersionFromPackFormat(packFormat: number): string | undefined {
  switch (packFormat) {
    case 15:
      return "1.20.1";
    case 26:
      return "1.20.6";
    case 34:
      return "1.21.1";
    default:
      return undefined;
  }
}

function minecraftVersionFromForgeMajor(major: string | undefined): string | undefined {
  switch (major) {
    case "47":
      return "1.20.1";
    default:
      return undefined;
  }
}

function minecraftVersionFromNeoForgeMajor(
  major: string | undefined
): string | undefined {
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
