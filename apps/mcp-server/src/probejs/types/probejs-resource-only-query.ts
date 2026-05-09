export function isProbeResourceOnlyRequest(
  requestText: string | undefined
): boolean {
  const text = requestText?.toLowerCase() ?? "";
  if (!text.includes("probe") && !text.includes("kubejs")) {
    return false;
  }

  return (
    PROBE_RESOURCE_ONLY_ACTION_TERMS.some((term) => text.includes(term)) &&
    PROBE_RESOURCE_ONLY_TERMS.some((term) => text.includes(term))
  );
}

export function extractExplicitProbeResourceQueries(
  requestText: string | undefined
): string[] {
  const queries = new Set<string>();
  for (const resourceId of requestText?.match(/#?[a-z0-9_.-]+:[a-z0-9_./-]+/gi) ??
    []) {
    addQuery(queries, resourceId);
    addQuery(queries, resourceId.replace(/^#/, ""));
  }

  return [...queries];
}

function addQuery(queries: Set<string>, value: string | undefined): void {
  const query = value?.trim().replace(/[,.]+$/g, "");
  if (query && query.length >= 3) {
    queries.add(query);
  }
}

const PROBE_RESOURCE_ONLY_ACTION_TERMS = [
  "available",
  "count",
  "counts",
  "discover",
  "find",
  "inspect",
  "list",
  "prepare",
  "query",
  "search",
  "show",
  "summarize",
  "summary",
  "列出",
  "查看",
  "检查",
  "总结",
  "汇总",
  "可用"
];

const PROBE_RESOURCE_ONLY_TERMS = [
  "item",
  "fluid",
  "event",
  "events",
  "forgeevents",
  "global",
  "tag",
  "nativeevents",
  "recipe",
  "registry",
  "registries",
  "snippet",
  "snippets",
  "type",
  "types",
  "resource",
  "resources"
];
