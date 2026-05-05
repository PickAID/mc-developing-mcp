export interface LineRangeEvidence {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
}

export interface LineRangeEvidenceOptions {
  startLine?: number;
  endLine?: number;
  targetLine?: number;
  radius?: number;
  maxLines?: number;
}

export function createFullContentLineRangeEvidence(
  content: string
): LineRangeEvidence {
  return createLineRangeEvidence(content);
}

export function createLineRangeEvidence(
  content: string,
  options: LineRangeEvidenceOptions = {}
): LineRangeEvidence {
  const lines = splitContentLines(content);
  const totalLines = lines.length;
  const explicitRange = normalizeExplicitRange(options, totalLines);
  if (explicitRange) {
    return buildLineRange(lines, totalLines, explicitRange);
  }

  const targetLine = normalizeTargetLine(options.targetLine, totalLines);

  if (!targetLine) {
    return {
      content,
      startLine: 1,
      endLine: totalLines,
      totalLines,
      truncated: false
    };
  }

  const radius = Math.max(0, Math.floor(options.radius ?? 20));
  const maxLines = Math.max(1, Math.floor(options.maxLines ?? radius * 2 + 1));
  const startLine = Math.max(1, targetLine - radius);
  const endLine = Math.min(totalLines, startLine + maxLines - 1);

  return buildLineRange(lines, totalLines, { startLine, endLine });
}

function buildLineRange(
  lines: string[],
  totalLines: number,
  range: { startLine: number; endLine: number }
): LineRangeEvidence {
  return {
    content: lines.slice(range.startLine - 1, range.endLine).join("\n"),
    startLine: range.startLine,
    endLine: range.endLine,
    totalLines,
    truncated: range.startLine > 1 || range.endLine < totalLines
  };
}

function splitContentLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }

  const contentWithoutTerminatingNewline = content.replace(
    /(?:\r\n|\n|\r)$/u,
    ""
  );

  if (contentWithoutTerminatingNewline.length === 0) {
    return [""];
  }

  return contentWithoutTerminatingNewline.split(/\r\n|\n|\r/u);
}

function normalizeTargetLine(
  targetLine: number | undefined,
  totalLines: number
): number | undefined {
  if (targetLine === undefined || totalLines === 0) {
    return undefined;
  }

  return Math.min(totalLines, Math.max(1, Math.floor(targetLine)));
}

function normalizeExplicitRange(
  options: LineRangeEvidenceOptions,
  totalLines: number
): { startLine: number; endLine: number } | undefined {
  if (options.startLine === undefined || totalLines === 0) {
    return undefined;
  }

  const startLine = Math.min(
    totalLines,
    Math.max(1, Math.floor(options.startLine))
  );
  const rawEndLine = options.endLine ?? startLine;
  const requestedEndLine = Math.max(startLine, Math.floor(rawEndLine));
  const maxLines = options.maxLines
    ? Math.max(1, Math.floor(options.maxLines))
    : undefined;
  const cappedEndLine = maxLines
    ? Math.min(requestedEndLine, startLine + maxLines - 1)
    : requestedEndLine;
  const endLine = Math.min(totalLines, cappedEndLine);

  return { startLine, endLine };
}
