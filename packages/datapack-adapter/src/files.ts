import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { discoverRoots } from "./discovery.js";
import { classifyKind } from "./kinds.js";
import { isInside, relativePosix } from "./path-utils.js";
import type {
  DatapackBudget,
  DatapackDomain,
  DatapackFileEntry,
  DatapackFileList,
  DatapackFileSummary,
  DatapackReadResult,
  DatapackRoot,
  DatapackSearchResult,
  DatapackSkippedFile
} from "./types.js";

const DEFAULT_MAX_BYTES_PER_FILE = 1024 * 1024;

export async function listDatapackFiles(
  root: string,
  budget: DatapackBudget = {}
): Promise<DatapackFileList> {
  const absoluteRoot = resolve(root);
  const entries: DatapackFileEntry[] = [];
  const skipped: DatapackSkippedFile[] = [];
  const roots = await discoverRoots(absoluteRoot);
  let visitedFiles = 0;
  let truncated = false;

  for (const contentRoot of roots) {
    for (const domain of ["assets", "data"] as const) {
      for await (const absolutePath of walkFiles(join(contentRoot.absolutePath, domain))) {
        visitedFiles += 1;
        if (budget.maxFiles !== undefined && visitedFiles > budget.maxFiles) {
          truncated = true;
          break;
        }

        const entry = await createEntry({
          scanRoot: absoluteRoot,
          contentRoot,
          absolutePath
        });
        if (entry === undefined) {
          skipped.push(createSkipped(contentRoot.absolutePath, absolutePath, "unreadable"));
          continue;
        }

        if (!withinEntryLimit(entries, budget)) {
          truncated = true;
          break;
        }

        entries.push(entry);
      }

      if (truncated) {
        break;
      }
    }

    if (truncated) {
      break;
    }

    if (contentRoot.hasPackMcmeta) {
      const metadataResult = await appendPackMetadataEntry({
        scanRoot: absoluteRoot,
        contentRoot: contentRoot.absolutePath,
        rootKind: contentRoot.rootKind,
        entries,
        skipped,
        budget,
        visitedFiles
      });
      visitedFiles = metadataResult.visitedFiles;
      truncated = metadataResult.truncated;
    }
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { entries, skipped, truncated };
}

export async function summarizeDatapackFiles(
  root: string,
  budget: DatapackBudget = {}
): Promise<DatapackFileSummary> {
  const roots = await discoverRoots(root);
  const listed = await listDatapackFiles(root, budget);
  const byRootKind: DatapackFileSummary["byRootKind"] = {};
  const byDomain: DatapackFileSummary["byDomain"] = {};
  const byKind: DatapackFileSummary["byKind"] = {};
  const byNamespace: DatapackFileSummary["byNamespace"] = {};

  for (const contentRoot of roots) {
    byRootKind[contentRoot.rootKind] = (byRootKind[contentRoot.rootKind] ?? 0) + 1;
  }

  for (const entry of listed.entries) {
    byDomain[entry.domain] = (byDomain[entry.domain] ?? 0) + 1;
    byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
    byNamespace[entry.namespace] = (byNamespace[entry.namespace] ?? 0) + 1;
  }

  return {
    rootCount: roots.length,
    entryCount: listed.entries.length,
    byRootKind,
    byDomain,
    byKind,
    byNamespace,
    skipped: listed.skipped,
    truncated: listed.truncated
  };
}

async function appendPackMetadataEntry(input: {
  scanRoot: string;
  contentRoot: string;
  rootKind: DatapackRoot["rootKind"];
  entries: DatapackFileEntry[];
  skipped: DatapackSkippedFile[];
  budget: DatapackBudget;
  visitedFiles: number;
}): Promise<{ visitedFiles: number; truncated: boolean }> {
  const visitedFiles = input.visitedFiles + 1;
  if (input.budget.maxFiles !== undefined && visitedFiles > input.budget.maxFiles) {
    return { visitedFiles, truncated: true };
  }

  const absolutePath = join(input.contentRoot, "pack.mcmeta");
  const entry = await createEntry({
    scanRoot: input.scanRoot,
    contentRoot: {
      absolutePath: input.contentRoot,
      rootKind: input.rootKind
    },
    absolutePath
  });
  if (entry !== undefined && withinEntryLimit(input.entries, input.budget)) {
    input.entries.push(entry);
    return { visitedFiles, truncated: false };
  }
  if (entry === undefined) {
    input.skipped.push(createSkipped(input.contentRoot, absolutePath, "unreadable"));
    return { visitedFiles, truncated: false };
  }
  return { visitedFiles, truncated: true };
}

export async function searchDatapackFiles(
  root: string,
  query: string,
  budget: DatapackBudget = {}
): Promise<DatapackSearchResult> {
  const listed = await listDatapackFiles(root, budget);
  const matches: DatapackSearchResult["matches"] = [];
  const skipped = [...listed.skipped];

  for (const entry of listed.entries) {
    const metadataMatch = findInResourceLocationMetadata(entry, query);
    if (metadataMatch !== undefined) {
      matches.push({ file: entry, ...metadataMatch });
      continue;
    }

    const content = await readTextEntry(entry, budget.maxBytesPerFile);

    if (typeof content !== "string") {
      skipped.push(content);
      continue;
    }

    const match = findInContent(content, query);
    if (match !== undefined) {
      matches.push({ file: entry, ...match });
    }
  }

  return { matches, skipped, truncated: listed.truncated };
}

export async function readDatapackFile(
  root: string,
  relativePath: string,
  budget: DatapackBudget = {}
): Promise<DatapackReadResult> {
  const absoluteRoot = resolve(root);
  const attemptedPath = resolve(absoluteRoot, relativePath);

  if (isAbsolute(relativePath) || !isInside(absoluteRoot, attemptedPath)) {
    return { skipped: { absolutePath: attemptedPath, relativePath, reason: "unreadable" } };
  }

  const roots = await discoverRoots(absoluteRoot);
  const candidateRoots = [
    ...roots,
    {
      absolutePath: absoluteRoot,
      rootKind: rootKindForAbsoluteRoot(absoluteRoot, roots)
    }
  ];
  let entry: DatapackFileEntry | undefined;

  for (const candidateRoot of candidateRoots) {
    const candidatePath = resolve(candidateRoot.absolutePath, relativePath);
    if (!isInside(candidateRoot.absolutePath, candidatePath)) {
      continue;
    }

    entry = await createEntry({
      scanRoot: absoluteRoot,
      contentRoot: candidateRoot,
      absolutePath: candidatePath
    });
    if (entry !== undefined) {
      break;
    }
  }

  if (entry === undefined) {
    return { skipped: { absolutePath: attemptedPath, relativePath, reason: "unreadable" } };
  }

  const content = await readTextEntry(entry, budget.maxBytesPerFile);
  if (typeof content !== "string") {
    return { skipped: content };
  }

  return { file: entry, content };
}

async function* walkFiles(directory: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      yield* walkFiles(absolutePath);
    } else if (entry.isFile()) {
      yield absolutePath;
    }
  }
}

async function createEntry(input: {
  scanRoot: string;
  contentRoot: Pick<DatapackRoot, "absolutePath" | "rootKind">;
  absolutePath: string;
}): Promise<DatapackFileEntry | undefined> {
  const rootRelativePath = toRootRelativePath(
    input.scanRoot,
    input.contentRoot.absolutePath
  );
  const relativePath = relativePosix(input.contentRoot.absolutePath, input.absolutePath);
  if (isPackMetadataPath(relativePath)) {
    return createPackMetadataEntry(input.absolutePath, {
      relativePath,
      rootKind: input.contentRoot.rootKind,
      rootRelativePath
    });
  }

  const segments = relativePath.split("/");
  const domain = segments[0] as DatapackDomain | undefined;

  if (domain !== "data" && domain !== "assets") {
    return undefined;
  }

  const namespace = segments[1];
  if (namespace === undefined || namespace.length === 0) {
    return undefined;
  }

  try {
    const fileStat = await stat(input.absolutePath);
    if (!fileStat.isFile()) {
      return undefined;
    }

    return {
      absolutePath: input.absolutePath,
      rootKind: input.contentRoot.rootKind,
      rootRelativePath,
      relativePath,
      namespace,
      kind: classifyKind(domain, segments[2]),
      domain,
      sizeBytes: fileStat.size,
      resourceLocations: buildResourceLocations(domain, namespace, segments)
    };
  } catch {
    return undefined;
  }
}

async function createPackMetadataEntry(
  absolutePath: string,
  input: {
    relativePath: string;
    rootKind: DatapackRoot["rootKind"];
    rootRelativePath: string;
  }
): Promise<DatapackFileEntry | undefined> {
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return undefined;
    }

    return {
      absolutePath,
      rootKind: input.rootKind,
      rootRelativePath: input.rootRelativePath,
      relativePath: input.relativePath,
      namespace: "",
      kind: "pack_metadata",
      domain: "assets",
      sizeBytes: fileStat.size
    };
  } catch {
    return undefined;
  }
}

function isPackMetadataPath(relativePath: string): boolean {
  return relativePath === "pack.mcmeta" || relativePath === "pack.png";
}

function rootKindForAbsoluteRoot(
  absoluteRoot: string,
  roots: DatapackRoot[]
): DatapackRoot["rootKind"] {
  return roots.find((contentRoot) => contentRoot.absolutePath === absoluteRoot)
    ?.rootKind ?? "workspace_data_root";
}

function toRootRelativePath(scanRoot: string, contentRoot: string): string {
  return relativePosix(scanRoot, contentRoot) || ".";
}

function withinEntryLimit(
  entries: DatapackFileEntry[],
  budget: DatapackBudget
): boolean {
  return budget.limit === undefined || entries.length < budget.limit;
}

async function readTextEntry(
  entry: DatapackFileEntry,
  maxBytesPerFile = DEFAULT_MAX_BYTES_PER_FILE
): Promise<string | DatapackSkippedFile> {
  if (entry.sizeBytes > maxBytesPerFile) {
    return skippedFromEntry(entry, "too-large");
  }

  try {
    const content = await readFile(entry.absolutePath);

    if (isBinary(content)) {
      return skippedFromEntry(entry, "binary");
    }

    return content.toString("utf-8");
  } catch {
    return skippedFromEntry(entry, "unreadable");
  }
}

function findInContent(content: string, query: string) {
  const index = content.indexOf(query);
  if (index < 0) {
    return undefined;
  }

  const before = content.slice(0, index);
  const lines = before.split("\n");

  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
    preview: content.split("\n")[lines.length - 1] ?? ""
  };
}

function findInResourceLocationMetadata(
  entry: DatapackFileEntry,
  query: string
) {
  const normalizedQuery = query.toLowerCase();
  if (!entry.resourceLocations?.includes(normalizedQuery)) {
    return undefined;
  }

  return {
    line: 1,
    column: 1,
    preview: `resource-location metadata: ${normalizedQuery}`
  };
}

function buildResourceLocations(
  domain: DatapackDomain,
  namespace: string,
  segments: string[]
): string[] | undefined {
  if (domain !== "assets") {
    return undefined;
  }

  const assetKind = segments[2];
  const pathSegments = segments.slice(3);
  const path = stripKnownExtension(pathSegments.join("/"));
  if (!path) {
    return undefined;
  }

  if (assetKind === "items") {
    return [`${namespace}:item/${path}`];
  }

  if (assetKind === "models" || assetKind === "textures") {
    return [`${namespace}:${path}`];
  }

  return undefined;
}

function stripKnownExtension(path: string): string {
  return path.replace(/\.(?:json|png|mcmeta|txt|fsh|vsh)$/i, "").toLowerCase();
}

function isBinary(content: Buffer): boolean {
  if (content.includes(0)) {
    return true;
  }

  const sampleLength = Math.min(content.length, 512);
  let controlCharacters = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    const byte = content[index];
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      controlCharacters += 1;
    }
  }

  return sampleLength > 0 && controlCharacters / sampleLength > 0.1;
}

function createSkipped(
  root: string,
  absolutePath: string,
  reason: DatapackSkippedFile["reason"]
): DatapackSkippedFile {
  return {
    absolutePath,
    relativePath: relativePosix(root, absolutePath),
    reason
  };
}

function skippedFromEntry(
  entry: DatapackFileEntry,
  reason: DatapackSkippedFile["reason"]
): DatapackSkippedFile {
  return {
    absolutePath: entry.absolutePath,
    relativePath: entry.relativePath,
    reason
  };
}
