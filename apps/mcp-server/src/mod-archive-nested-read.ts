import { readNestedArchiveContentFile } from "@mcpskill/jar-source-adapter";

import type { McpServerEvidenceExecutorResult } from "./request-handler.js";

const DEFAULT_MAX_BYTES_PER_FILE = 65_536;

export interface NestedArchiveEntryRequest {
  embeddedArchivePath: string;
  relativePath: string;
}

export function extractNestedArchiveEntryPath(
  requestText?: string
): NestedArchiveEntryRequest | undefined {
  if (!requestText) {
    return undefined;
  }

  const text = requestText.replace(/[`"'“”‘’]/g, " ");
  const match = text.match(
    /\b([A-Za-z0-9_./+$-]+\.jar)!\/((?:data|assets)\/[A-Za-z0-9_./+$-]+\.(?:json|mcmeta|txt|toml|lang|png)|(?:[A-Za-z_$][\w$]*\/){2,}[A-Za-z_$][\w$]*\.(?:java|class))\b/
  );

  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return {
    embeddedArchivePath: match[1].replace(/[),.;:]+$/g, ""),
    relativePath: match[2].replace(/[),.;:]+$/g, "")
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
