export interface SourceTextChunk {
  chunkId: string;
  chunkType: "file_head" | "code_window";
  startLine: number;
  endLine: number;
  content: string;
  tokenCount: number;
}

const DEFAULT_MAX_LINES = 40;

export function chunkSourceText(
  content: string,
  options: { maxLines?: number } = {}
): SourceTextChunk[] {
  const lines = content.split(/\r?\n/);
  const maxLines = Math.max(1, options.maxLines ?? DEFAULT_MAX_LINES);
  const chunks: SourceTextChunk[] = [];

  for (let index = 0; index < lines.length; index += maxLines) {
    const selected = lines.slice(index, index + maxLines);
    const text = selected.join("\n");
    chunks.push({
      chunkId: `lines-${index + 1}-${index + selected.length}`,
      chunkType: index === 0 ? "file_head" : "code_window",
      startLine: index + 1,
      endLine: index + selected.length,
      content: text,
      tokenCount: text.split(/\s+/).filter(Boolean).length
    });
  }

  return chunks;
}
