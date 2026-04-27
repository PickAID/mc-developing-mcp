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
  DatapackReadResult,
  DatapackSearchResult,
  DatapackSkippedFile
} from "./types.js";

const DEFAULT_MAX_BYTES_PER_FILE = 1024 * 1024;

export async function listDatapackFiles(
  root: string,
  budget: DatapackBudget = {}
): Promise<DatapackFileList> {
  const entries: DatapackFileEntry[] = [];
  const skipped: DatapackSkippedFile[] = [];
  const roots = await discoverRoots(root);
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

        const entry = await createEntry(contentRoot.absolutePath, absolutePath);
        if (entry === undefined) {
          skipped.push(createSkipped(contentRoot.absolutePath, absolutePath, "unreadable"));
          continue;
        }

        if (budget.limit !== undefined && entries.length >= budget.limit) {
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
  }

  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { entries, skipped, truncated };
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
    absoluteRoot,
    ...roots.map((contentRoot) => contentRoot.absolutePath)
  ];
  let entry: DatapackFileEntry | undefined;

  for (const candidateRoot of candidateRoots) {
    const candidatePath = resolve(candidateRoot, relativePath);
    if (!isInside(candidateRoot, candidatePath)) {
      continue;
    }

    entry = await createEntry(candidateRoot, candidatePath);
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

async function createEntry(root: string, absolutePath: string): Promise<DatapackFileEntry | undefined> {
  const relativePath = relativePosix(root, absolutePath);
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
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return undefined;
    }

    return {
      absolutePath,
      relativePath,
      namespace,
      kind: classifyKind(domain, segments[2]),
      domain,
      sizeBytes: fileStat.size
    };
  } catch {
    return undefined;
  }
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
