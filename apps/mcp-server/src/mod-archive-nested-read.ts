import {
  readNestedArchiveContentFile,
  readNestedArchiveContentFiles
} from "@mcpskill/jar-source-adapter";

import type { McpServerEvidenceExecutorResult } from "./request-handler.js";

const DEFAULT_MAX_BYTES_PER_FILE = 65_536;
const MAX_BATCH_READ_ENTRIES = 8;

export interface NestedArchiveEntryRequest {
  embeddedArchivePath: string;
  relativePath: string;
}

export interface NestedArchiveEntryPathRequest {
  requests: NestedArchiveEntryRequest[];
  truncated: boolean;
}

export function extractNestedArchiveEntryPath(
  requestText?: string
): NestedArchiveEntryRequest | undefined {
  return extractNestedArchiveEntryPathRequest(requestText).requests[0];
}

export function extractNestedArchiveEntryPathRequest(
  requestText?: string
): NestedArchiveEntryPathRequest {
  if (!requestText) {
    return { requests: [], truncated: false };
  }

  const text = requestText.replace(/[`"'“”‘’]/g, " ");
  const matches = text.matchAll(
    /\b([A-Za-z0-9_./+$-]+\.jar)!\/((?:data|assets)\/[A-Za-z0-9_./+$-]+\.(?:json|mcmeta|txt|toml|lang|png)|(?:[A-Za-z_$][\w$]*\/){2,}[A-Za-z_$][\w$]*\.(?:java|class))\b/g
  );
  const requests = uniqueRequests(
    [...matches].flatMap((match) => {
      if (!match[1] || !match[2]) {
        return [];
      }

      return [{
        embeddedArchivePath: match[1].replace(/[),.;:]+$/g, ""),
        relativePath: match[2].replace(/[),.;:]+$/g, "")
      }];
    })
  );

  return {
    requests: requests.slice(0, MAX_BATCH_READ_ENTRIES),
    truncated: requests.length > MAX_BATCH_READ_ENTRIES
  };
}

export async function readSelectedNestedEntry(input: {
  sourceArchive: string;
  request: NestedArchiveEntryRequest;
}): Promise<McpServerEvidenceExecutorResult> {
  const result = await readNestedArchiveContentFile({
    sourceArchive: input.sourceArchive,
    embeddedArchivePath: input.request.embeddedArchivePath,
    relativePath: input.request.relativePath,
    maxBytes: DEFAULT_MAX_BYTES_PER_FILE
  });
  const payload = {
    source: "mod_archive_content",
    mode: "read_nested",
    requestedPath: input.request.relativePath,
    ...result
  };

  if (!result.content) {
    return {
      matched: false,
      summary: `Could not read ${input.request.relativePath} from nested mod archive.`,
      payload
    };
  }

  return {
    matched: true,
    summary: `Read ${input.request.relativePath} from nested mod archive.`,
    payload
  };
}

export async function readSelectedNestedEntries(input: {
  sourceArchive: string;
  requests: NestedArchiveEntryRequest[];
  truncated: boolean;
}): Promise<McpServerEvidenceExecutorResult> {
  const files = [];

  for (const group of groupRequestsByEmbeddedArchive(input.requests)) {
    const result = await readNestedArchiveContentFiles({
      sourceArchive: input.sourceArchive,
      embeddedArchivePath: group.embeddedArchivePath,
      relativePaths: group.relativePaths,
      maxBytes: DEFAULT_MAX_BYTES_PER_FILE
    });

    files.push(
      ...result.files.map((file) => ({
        embeddedArchivePath: result.embeddedArchivePath,
        embeddedArchiveMetadata: result.embeddedArchiveMetadata,
        ...file
      }))
    );
  }

  const readCount = files.filter((file) => file.content).length;
  const requestedPaths = input.requests.map((request) => {
    return `${request.embeddedArchivePath}!/${request.relativePath}`;
  });
  const payload = {
    source: "mod_archive_content",
    mode: "read_nested_many",
    sourceArchive: input.sourceArchive,
    requestedPaths,
    files,
    truncated: input.truncated
  };

  if (readCount === 0) {
    return {
      matched: false,
      summary: "Could not read requested nested mod archive entries.",
      payload
    };
  }

  return {
    matched: true,
    summary: `Read ${readCount} nested mod archive entrie(s).`,
    payload
  };
}

function groupRequestsByEmbeddedArchive(requests: NestedArchiveEntryRequest[]) {
  const groups = new Map<string, string[]>();

  for (const request of requests) {
    const paths = groups.get(request.embeddedArchivePath) ?? [];
    paths.push(request.relativePath);
    groups.set(request.embeddedArchivePath, paths);
  }

  return [...groups].map(([embeddedArchivePath, relativePaths]) => ({
    embeddedArchivePath,
    relativePaths
  }));
}

function uniqueRequests(
  requests: NestedArchiveEntryRequest[]
): NestedArchiveEntryRequest[] {
  const seen = new Set<string>();
  const unique: NestedArchiveEntryRequest[] = [];

  for (const request of requests) {
    const key = `${request.embeddedArchivePath}!/${request.relativePath}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(request);
    }
  }

  return unique;
}
