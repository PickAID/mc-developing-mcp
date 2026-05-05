import type { DatapackFileEntry } from "@mcpskill/datapack-adapter";

import {
  createLineRangeEvidence,
  type LineRangeEvidenceOptions
} from "../shared/line-range-evidence.js";
import { buildSourceReadNextReads } from "../shared/source-read-next.js";

const LINE_HINT_RADIUS = 20;
const LINE_HINT_MAX_LINES = 200;

export interface DatapackReadEvidence {
  file: DatapackFileEntry;
  content: string;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  truncated?: boolean;
  nextReads?: string[];
}

export interface RequestedDatapackRead {
  path: string;
  line?: number;
  endLine?: number;
}

export function toLineRangeDatapackReadEvidence(
  file: DatapackFileEntry,
  content: string,
  request: RequestedDatapackRead
): DatapackReadEvidence {
  const range = createLineRangeEvidence(content, buildRangeOptions(request));

  return {
    file,
    content: range.content,
    startLine: range.startLine,
    endLine: range.endLine,
    totalLines: range.totalLines,
    truncated: range.truncated,
    nextReads: buildSourceReadNextReads({
      path: file.relativePath,
      startLine: range.startLine,
      endLine: range.endLine
    })
  };
}

export function parseRequestedDatapackRead(
  value: string
): RequestedDatapackRead {
  const normalizedPath = value.replaceAll("\\", "/");
  const match = normalizedPath.match(
    /^(?<path>(?:data|assets)\/.+):(?<line>\d+)(?:-(?<endLine>\d+)|:\d+)?$/u
  );

  if (!match?.groups) {
    return { path: normalizedPath };
  }

  return {
    path: match.groups.path,
    line: Number(match.groups.line),
    endLine: match.groups.endLine ? Number(match.groups.endLine) : undefined
  };
}

function buildRangeOptions(
  request: RequestedDatapackRead
): LineRangeEvidenceOptions {
  if (request.line === undefined) {
    return {};
  }
  if (request.endLine !== undefined) {
    return {
      startLine: request.line,
      endLine: request.endLine,
      maxLines: LINE_HINT_MAX_LINES
    };
  }

  return {
    targetLine: request.line,
    radius: LINE_HINT_RADIUS,
    maxLines: LINE_HINT_MAX_LINES
  };
}
