import {
  listNestedArchiveContent,
  type ArchiveContentDomain
} from "minecraft-developing-mcp-jar-source-adapter";

import type { McpServerEvidenceExecutorResult } from "../../request/execution/request-handler.js";

const DEFAULT_MAX_LIST_ENTRIES = 64;

export function extractNestedArchiveListPath(
  requestText?: string
): string | undefined {
  if (!requestText) {
    return undefined;
  }

  const text = requestText.replace(/[`"'“”‘’]/g, " ");
  const match = text.match(/\b([A-Za-z0-9_./+$-]+\.jar)!(?:\/)?(?:\s|$)/);
  return match?.[1]?.replace(/[),.;:]+$/g, "");
}

export async function listSelectedNestedEntries(input: {
  sourceArchive: string;
  embeddedArchivePath: string;
  domains: ArchiveContentDomain[];
}): Promise<McpServerEvidenceExecutorResult> {
  const result = await listNestedArchiveContent({
    sourceArchive: input.sourceArchive,
    embeddedArchivePath: input.embeddedArchivePath,
    domains: input.domains,
    limit: DEFAULT_MAX_LIST_ENTRIES
  });
  const payload = {
    source: "mod_archive_content",
    mode: "list_nested",
    domains: input.domains,
    ...result
  };

  if (result.skipped) {
    return {
      matched: false,
      summary: `Could not list ${input.embeddedArchivePath} from selected mod archive.`,
      payload
    };
  }

  return {
    matched: true,
    summary: `Listed ${result.entries.length} nested mod archive entrie(s).`,
    payload
  };
}
