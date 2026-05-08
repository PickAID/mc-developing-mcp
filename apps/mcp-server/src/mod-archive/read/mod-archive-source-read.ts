import type { ArchiveContentDomain } from "minecraft-developing-mcp-jar-source-adapter";

import {
  createLineRangeEvidence,
  type LineRangeEvidenceOptions
} from "../../source-bundle/shared/line-range-evidence.js";
import { buildSourceReadNextReads } from "../../source-bundle/shared/source-read-next.js";

const LINE_HINT_RADIUS = 20;
const LINE_HINT_MAX_LINES = 41;

export interface ModArchiveTextRead {
  entry?: {
    relativePath: string;
    domain: ArchiveContentDomain;
  };
  content?: string;
}

export function applyModArchiveSourceLineRange<T extends ModArchiveTextRead>(
  result: T,
  requestText?: string,
  pathPrefix?: string
): T {
  if (!result.entry || result.content === undefined) {
    return result;
  }

  const requestedRange = findRequestedLineRange(
    requestText,
    result.entry.relativePath,
    pathPrefix
  );
  if (result.entry.domain !== "java" && !requestedRange) {
    return result;
  }

  const path = pathPrefix
    ? `${pathPrefix}!/${result.entry.relativePath}`
    : result.entry.relativePath;
  const range = createLineRangeEvidence(
    result.content,
    requestedRange ?? { startLine: 1, endLine: LINE_HINT_MAX_LINES }
  );

  return {
    ...result,
    content: range.content,
    startLine: range.startLine,
    endLine: range.endLine,
    totalLines: range.totalLines,
    truncated: range.truncated,
    nextReads: buildSourceReadNextReads({
      path,
      startLine: range.startLine,
      endLine: range.endLine
    })
  };
}

function findRequestedLineRange(
  requestText: string | undefined,
  relativePath: string,
  pathPrefix?: string
): LineRangeEvidenceOptions | undefined {
  const fileName = relativePath.split("/").at(-1);
  const prefixedPath = pathPrefix ? `${pathPrefix}!/${relativePath}` : undefined;

  for (const hint of extractLineHints(requestText)) {
    if (
      hint.path === relativePath ||
      hint.path === fileName ||
      (prefixedPath ? hint.path === prefixedPath : hint.path.endsWith(`!/${relativePath}`))
    ) {
      return hint.endLine
        ? {
            startLine: hint.line,
            endLine: hint.endLine,
            maxLines: LINE_HINT_MAX_LINES
          }
        : {
            targetLine: hint.line,
            radius: LINE_HINT_RADIUS,
            maxLines: LINE_HINT_MAX_LINES
          };
    }
  }
}

function extractLineHints(
  requestText: string | undefined
): Array<{ path: string; line: number; endLine?: number }> {
  if (!requestText) {
    return [];
  }

  const matches = requestText.matchAll(
    /\b([A-Za-z0-9_.$/+!-]+\.(?:java|json|mcmeta|txt|toml|lang)):(\d+)(?:-(\d+)|:\d+)?/gi
  );

  return [...matches].map((match) => ({
    path: match[1].replaceAll("\\", "/"),
    line: Number(match[2]),
    endLine: match[3] ? Number(match[3]) : undefined
  }));
}
