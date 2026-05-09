import { readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

import {
  findArchiveSetClassOwners,
  type ArchiveContentCache
} from "minecraft-developing-mcp-jar-source-adapter";

import type {
  McpServerEvidenceExecutorResult
} from "../../request/execution/request-handler.js";
import { DEFAULT_MAX_CLASS_OWNER_ARCHIVES } from "../content/mod-archive-content-constants.js";
import { attachArchiveMetadata } from "../content/mod-archive-content-metadata.js";

const MAX_PATCH_FILES = 64;
const HOTAI_ROOT = "hotai";

export async function lookupHotaiPatchProof(input: {
  workspaceRoot: string;
  archivePaths: string[];
  requestText?: string;
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult | undefined> {
  if (!isHotaiProofRequest(input.requestText)) {
    return undefined;
  }

  const patches = await discoverHotaiPatchFiles(input.workspaceRoot);
  if (patches.length === 0) {
    return undefined;
  }

  const owners = await findArchiveSetClassOwners({
    sourceArchives: input.archivePaths,
    classNames: unique(patches.map((patch) => patch.targetClass)),
    maxArchives: DEFAULT_MAX_CLASS_OWNER_ARCHIVES,
    cache: input.cache
  });
  const ownerMatches = await attachArchiveMetadata(owners.matches);
  const enrichedPatches = patches.map((patch) => {
    const targetOwner = ownerMatches.find(
      (owner) => owner.requestedClassName === patch.targetClass
    );

    return {
      ...patch,
      ...(targetOwner ? { targetOwner } : {}),
      proofStatus: targetOwner ? "owner_matched" : "owner_missing"
    };
  });
  const unmatchedTargets = enrichedPatches
    .filter((patch) => patch.proofStatus === "owner_missing")
    .map((patch) => patch.targetClass);

  return {
    matched: true,
    summary: `Verified ${ownerMatches.length} HotAI patch target(s) against local mod archives.`,
    payload: {
      source: "mod_archive_content",
      mode: "hotai_patch_proof",
      tokenPolicy: "compact_hotai_patch_proof",
      executionPolicy: "read_only_no_patch_execution",
      patchFileCount: patches.length,
      targetClassCount: unique(patches.map((patch) => patch.targetClass)).length,
      phaseCounts: countPhases(patches),
      patches: enrichedPatches,
      unmatchedTargets,
      searchedArchives: owners.searchedArchives,
      cache: owners.cache,
      truncated: owners.truncated || patches.length >= MAX_PATCH_FILES
    }
  };
}

function isHotaiProofRequest(requestText: string | undefined): boolean {
  return Boolean(requestText && /\bhotai\b|\.badiff\b|badiff/i.test(requestText));
}

async function discoverHotaiPatchFiles(workspaceRoot: string) {
  const patches: HotaiPatchFile[] = [];
  await collectHotaiPatchFiles(join(workspaceRoot, HOTAI_ROOT), workspaceRoot, patches);
  return patches.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function collectHotaiPatchFiles(
  root: string,
  workspaceRoot: string,
  patches: HotaiPatchFile[]
): Promise<void> {
  if (patches.length >= MAX_PATCH_FILES) {
    return;
  }

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (patches.length >= MAX_PATCH_FILES) {
      return;
    }

    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      await collectHotaiPatchFiles(absolutePath, workspaceRoot, patches);
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".badiff") {
      const relativePath = toPosixPath(relative(workspaceRoot, absolutePath));
      const targetClass = targetClassFromPatchPath(relativePath);
      if (targetClass) {
        patches.push({
          relativePath,
          phase: phaseFromPatchPath(relativePath),
          targetClass
        });
      }
    }
  }
}

interface HotaiPatchFile {
  relativePath: string;
  phase: string;
  targetClass: string;
}

function targetClassFromPatchPath(relativePath: string): string | undefined {
  const parts = relativePath.split("/");
  const hotaiIndex = parts.indexOf(HOTAI_ROOT);
  const classPathParts = parts.slice(hotaiIndex + 2);
  const last = classPathParts.at(-1);
  if (hotaiIndex < 0 || !last?.endsWith(".badiff") || classPathParts.length < 2) {
    return undefined;
  }

  return [
    ...classPathParts.slice(0, -1),
    last.slice(0, -".badiff".length)
  ].join(".");
}

function phaseFromPatchPath(relativePath: string): string {
  const parts = relativePath.split("/");
  const hotaiIndex = parts.indexOf(HOTAI_ROOT);
  return parts[hotaiIndex + 1] ?? "unknown";
}

function countPhases(patches: HotaiPatchFile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const patch of patches) {
    counts[patch.phase] = (counts[patch.phase] ?? 0) + 1;
  }
  return counts;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}
