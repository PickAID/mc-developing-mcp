import { readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { discoverRoots } from "./discovery.js";
import {
  findInContent,
  readTextEntry
} from "./file-content.js";
import {
  createEntry,
  createSkipped,
  provenanceForAbsoluteRoot,
  rootKindForAbsoluteRoot,
  withinEntryLimit
} from "./file-entry.js";
import { isInside } from "./path-utils.js";
import { findInResourceLocationMetadata } from "./resource-location-metadata.js";
import type {
  DatapackBudget,
  DatapackFileEntry,
  DatapackFileList,
  DatapackFileSummary,
  DatapackReadResult,
  DatapackRoot,
  DatapackSearchResult,
  DatapackSkippedFile
} from "./types.js";

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
        provenance: contentRoot.provenance,
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
  const byProvenance: DatapackFileSummary["byProvenance"] = {};
  const byDomain: DatapackFileSummary["byDomain"] = {};
  const byKind: DatapackFileSummary["byKind"] = {};
  const byNamespace: DatapackFileSummary["byNamespace"] = {};

  for (const contentRoot of roots) {
    byRootKind[contentRoot.rootKind] = (byRootKind[contentRoot.rootKind] ?? 0) + 1;
    byProvenance[contentRoot.provenance] =
      (byProvenance[contentRoot.provenance] ?? 0) + 1;
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
    byProvenance,
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
  provenance: DatapackRoot["provenance"];
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
      rootKind: input.rootKind,
      provenance: input.provenance
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
      rootKind: rootKindForAbsoluteRoot(absoluteRoot, roots),
      provenance: provenanceForAbsoluteRoot(absoluteRoot, roots)
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
