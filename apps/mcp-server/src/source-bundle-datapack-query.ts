const MAX_QUERIES = 8;

export function extractResourceLocationQueries(requestText: string): string[] {
  const matches = requestText.matchAll(/\b[a-z0-9_.-]+:[a-z0-9_.\-\/]+\b/gi);
  return unique([...matches].map((match) => match[0].toLowerCase()))
    .slice(0, MAX_QUERIES);
}

export function extractDatapackPathQueries(requestText: string): string[] {
  const matches = requestText.matchAll(/\b(?:data|assets)\/[A-Za-z0-9_.-]+\/[^\s'"`<>]+/g);
  return unique([...matches].map((match) => trimTrailingPunctuation(match[0])))
    .slice(0, MAX_QUERIES);
}

export function mentionsResourceReferenceTrace(requestText: string): boolean {
  return /\b(?:trace|reference|references|dependency|dependencies|missing|unresolved)\b|引用|依赖|追踪|缺失|丢失|找不到/i
    .test(requestText);
}

export function isTraceableAssetPath(path: string): boolean {
  return /^assets\/[^/]+\/(?:atlases|blockstates|font|items|models|particles)\//.test(path);
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[),.;:]+$/g, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
