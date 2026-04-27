import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { classifyKind } from "./kinds.js";
import type { AssetKind, DataKind, DatapackDiscovery, DatapackRoot } from "./types.js";

export async function discoverDatapackContent(root: string): Promise<DatapackDiscovery> {
  const roots = await discoverRoots(root);
  const namespaces = new Set<string>();
  const dataKinds = new Set<DataKind>();
  const assetKinds = new Set<AssetKind>();

  for (const contentRoot of roots) {
    await collectDomain(contentRoot.absolutePath, "data", namespaces, dataKinds);
    await collectDomain(contentRoot.absolutePath, "assets", namespaces, assetKinds);
  }

  return {
    roots,
    namespaces: [...namespaces].sort(),
    dataKinds: [...dataKinds].sort(),
    assetKinds: [...assetKinds].sort()
  };
}

export async function discoverRoots(root: string): Promise<DatapackRoot[]> {
  const absoluteRoot = resolve(root);
  const discovered: DatapackRoot[] = [];

  await visitForRoots(absoluteRoot, discovered);
  return discovered.sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
}

async function visitForRoots(directory: string, discovered: DatapackRoot[]): Promise<void> {
  const entries = await safeReadDirectory(directory);
  if (entries === undefined) {
    return;
  }

  const names = new Set(entries.map((entry) => entry.name));
  const root: DatapackRoot = {
    absolutePath: directory,
    hasPackMcmeta: names.has("pack.mcmeta"),
    hasData: names.has("data") && entries.some((entry) => entry.name === "data" && entry.isDirectory()),
    hasAssets: names.has("assets") && entries.some((entry) => entry.name === "assets" && entry.isDirectory())
  };

  if (root.hasPackMcmeta || root.hasData || root.hasAssets) {
    discovered.push(root);
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && !shouldSkipDirectory(entry.name)) {
      await visitForRoots(join(directory, entry.name), discovered);
    }
  }
}

async function collectDomain(
  root: string,
  domain: "data",
  namespaces: Set<string>,
  kinds: Set<DataKind>
): Promise<void>;
async function collectDomain(
  root: string,
  domain: "assets",
  namespaces: Set<string>,
  kinds: Set<AssetKind>
): Promise<void>;
async function collectDomain(
  root: string,
  domain: "data" | "assets",
  namespaces: Set<string>,
  kinds: Set<DataKind> | Set<AssetKind>
): Promise<void> {
  const domainRoot = join(root, domain);
  const namespaceEntries = await safeReadDirectory(domainRoot);
  if (namespaceEntries === undefined) {
    return;
  }

  for (const namespaceEntry of namespaceEntries) {
    if (!namespaceEntry.isDirectory()) {
      continue;
    }

    namespaces.add(namespaceEntry.name);
    const kindEntries = await safeReadDirectory(join(domainRoot, namespaceEntry.name));
    if (kindEntries === undefined) {
      continue;
    }

    for (const kindEntry of kindEntries) {
      if (kindEntry.isDirectory() || kindEntry.isFile()) {
        kinds.add(classifyKind(domain, kindEntry.name) as never);
      }
    }
  }
}

async function safeReadDirectory(directory: string) {
  try {
    const directoryStat = await stat(directory);
    if (!directoryStat.isDirectory()) {
      return undefined;
    }

    return await readdir(directory, { withFileTypes: true });
  } catch {
    return undefined;
  }
}

function shouldSkipDirectory(name: string): boolean {
  return name === "node_modules" || name === ".git" || name === "dist" || name === "build";
}
