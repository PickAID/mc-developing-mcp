import {
  listArchiveContent,
  readArchiveContentFile,
  readModArchiveMetadata,
  type ArchiveContentCache,
  type ArchiveContentDomain,
  type ModArchiveMetadata
} from "@mcpskill/jar-source-adapter";

import type { McpServerEvidenceExecutorResult } from "./request-handler.js";

const DEFAULT_MAX_BYTES_PER_FILE = 65_536;
const DEFAULT_MAX_LIST_ENTRIES = 64;
const MAX_BATCH_READ_ENTRIES = 8;

export interface ArchiveEntryPathRequest {
  paths: string[];
  truncated: boolean;
}

export function extractArchiveEntryPathRequest(
  requestText?: string
): ArchiveEntryPathRequest {
  if (!requestText) {
    return { paths: [], truncated: false };
  }

  const text = requestText.replace(/[`"'“”‘’]/g, " ");
  const matches = [
    ...text.matchAll(
      /\b(?:data|assets)\/[A-Za-z0-9_./+$-]+\.(?:json|mcmeta|txt|toml|lang|png)\b/g
    ),
    ...text.matchAll(
      /\b(?:[A-Za-z_$][\w$]*\/){2,}[A-Za-z_$][\w$]*\.(?:java|class)\b/g
    )
  ];
  const paths = uniquePaths(
    matches.map((match) => match[0].replace(/[),.;:]+$/g, ""))
  );

  return {
    paths: paths.slice(0, MAX_BATCH_READ_ENTRIES),
    truncated: paths.length > MAX_BATCH_READ_ENTRIES
  };
}

export async function readSelectedEntry(input: {
  sourceArchive: string;
  relativePath: string;
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult> {
  const result = await readArchiveContentFile({
    sourceArchive: input.sourceArchive,
    relativePath: input.relativePath,
    maxBytes: DEFAULT_MAX_BYTES_PER_FILE,
    cache: input.cache
  });
  const payload = {
    source: "mod_archive_content",
    mode: "read",
    sourceArchive: input.sourceArchive,
    archiveMetadata: await readArchiveMetadata(input.sourceArchive),
    requestedPath: input.relativePath,
    ...result
  };

  if (!result.content) {
    return {
      matched: false,
      summary: `Could not read ${input.relativePath} from selected mod archive.`,
      payload
    };
  }

  return {
    matched: true,
    summary: `Read ${input.relativePath} from selected mod archive.`,
    payload
  };
}

export async function readSelectedEntries(input: {
  sourceArchive: string;
  relativePaths: string[];
  truncated: boolean;
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult> {
  const files = [];

  for (const relativePath of input.relativePaths) {
    const result = await readArchiveContentFile({
      sourceArchive: input.sourceArchive,
      relativePath,
      maxBytes: DEFAULT_MAX_BYTES_PER_FILE,
      cache: input.cache
    });
    files.push({ requestedPath: relativePath, ...result });
  }

  const readCount = files.filter((file) => file.content).length;
  const payload = {
    source: "mod_archive_content",
    mode: "read_many",
    sourceArchive: input.sourceArchive,
    archiveMetadata: await readArchiveMetadata(input.sourceArchive),
    requestedPaths: input.relativePaths,
    files,
    truncated: input.truncated
  };

  if (readCount === 0) {
    return {
      matched: false,
      summary: "Could not read requested mod archive entries.",
      payload
    };
  }

  return {
    matched: true,
    summary: `Read ${readCount} mod archive entrie(s).`,
    payload
  };
}

export async function listSelectedEntries(input: {
  sourceArchive: string;
  domains: ArchiveContentDomain[];
  cache?: ArchiveContentCache;
}): Promise<McpServerEvidenceExecutorResult> {
  const result = await listArchiveContent({
    sourceArchive: input.sourceArchive,
    domains: input.domains,
    limit: DEFAULT_MAX_LIST_ENTRIES,
    cache: input.cache
  });

  return {
    matched: true,
    summary: `Listed ${result.entries.length} mod archive entrie(s).`,
    payload: {
      source: "mod_archive_content",
      mode: "list",
      sourceArchive: input.sourceArchive,
      archiveMetadata: await readArchiveMetadata(input.sourceArchive),
      domains: input.domains,
      entries: result.entries,
      cache: result.cache,
      truncated: result.truncated
    }
  };
}

async function readArchiveMetadata(
  sourceArchive: string
): Promise<ModArchiveMetadata | undefined> {
  return readModArchiveMetadata(sourceArchive).catch(() => undefined);
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const path of paths) {
    if (!seen.has(path)) {
      seen.add(path);
      unique.push(path);
    }
  }

  return unique;
}
