export function buildSourceReadNextReads(input: {
  path: string;
  startLine?: number;
  endLine?: number;
}): string[] {
  if (input.startLine === undefined || input.endLine === undefined) {
    return [];
  }

  return [`source.read ${input.path}:${input.startLine}-${input.endLine}`];
}
