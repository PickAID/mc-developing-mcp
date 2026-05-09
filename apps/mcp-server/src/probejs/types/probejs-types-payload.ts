import type {
  KubeJsSemanticResourceEntry,
  KubeJsSemanticResourceKind,
  KubeJsTypeSemanticSummary,
  KubeJsUnknownResource
} from "minecraft-developing-mcp-kubejs-types-adapter";

export function extractProbeResourceQueries(
  requestText: string | undefined,
  symbol?: string
): string[] {
  const queries = new Set<string>();
  let freeText = requestText ?? "";
  addQuery(queries, symbol);
  addQuery(queries, symbol?.split(".").at(-1));

  for (const resourceId of freeText.match(/#?[a-z0-9_.-]+:[a-z0-9_./-]+/gi) ?? []) {
    addQuery(queries, resourceId);
    addQuery(queries, resourceId.replace(/^#/, ""));
    freeText = freeText.replace(resourceId, " ");
  }

  for (const dotted of freeText.match(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g) ?? []) {
    addQuery(queries, dotted);
    if (/[A-Z$]/.test(dotted)) {
      addQuery(queries, dotted.split(".").at(-1));
    }
    freeText = freeText.replace(dotted, " ");
  }

  for (const word of freeText.match(/\b[A-Za-z][A-Za-z0-9_$-]{3,}\b/g) ?? []) {
    if (!isProbeResourceStopWord(word)) {
      addQuery(queries, word);
    }
  }

  return [...queries];
}

function addQuery(queries: Set<string>, value: string | undefined): void {
  const query = value?.trim().replace(/[,.]+$/g, "");
  if (query && query.length >= 3) {
    queries.add(query);
  }
}

function isProbeResourceStopWord(word: string): boolean {
  return PROBE_RESOURCE_STOP_WORDS.has(word.toLowerCase());
}

const PROBE_RESOURCE_STOP_WORDS = new Set([
  "and",
  "block",
  "class",
  "client",
  "fabric",
  "fluid",
  "forge",
  "item",
  "kubejs",
  "minecraft",
  "modpack",
  "neoforge",
  "registry",
  "script",
  "scripts",
  "server",
  "startup",
  "this",
  "use",
  "with"
]);

interface CompactProbeResourceEntry {
  sourceKind: KubeJsSemanticResourceKind;
  extractorId: string;
  sourceFormat: string;
  confidence: number;
  name: string;
  value: string;
  file: string;
  lineNumber?: number;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

interface CompactProbeUnknownResource {
  extractorId: string;
  sourceFormat: string;
  confidence: number;
  reason: string;
  file: string;
  preview: string;
}

interface CompactProbeResources {
  summary: KubeJsTypeSemanticSummary["summary"];
  capabilityUsage: KubeJsTypeSemanticSummary["capabilityUsage"];
  entries: Record<KubeJsSemanticResourceKind, CompactProbeResourceEntry[]>;
  unknownResources: CompactProbeUnknownResource[];
}

export function compactProbeResources(
  summary: KubeJsTypeSemanticSummary
): CompactProbeResources {
  return {
    summary: summary.summary,
    capabilityUsage: summary.capabilityUsage,
    entries: compactEntryGroups(summary.entries),
    unknownResources: compactUnknownResources(summary.unknownResources)
  };
}

function compactEntryGroups(
  entries: Record<KubeJsSemanticResourceKind, KubeJsSemanticResourceEntry[]>
): Record<KubeJsSemanticResourceKind, CompactProbeResourceEntry[]> {
  return Object.fromEntries(
    Object.entries(entries).map(([kind, values]) => [kind, compactEntries(values)])
  ) as Record<KubeJsSemanticResourceKind, CompactProbeResourceEntry[]>;
}

function compactEntries(
  entries: KubeJsSemanticResourceEntry[]
): CompactProbeResourceEntry[] {
  return entries.map((entry) => ({
    sourceKind: entry.sourceKind satisfies KubeJsSemanticResourceKind,
    extractorId: entry.extractorId,
    sourceFormat: entry.sourceFormat,
    confidence: entry.confidence,
    name: entry.name,
    value: entry.value,
    file: entry.file.relativePath,
    lineNumber: entry.lineNumber,
    warnings: entry.warnings,
    metadata: entry.metadata as Record<string, unknown> | undefined
  }));
}

function compactUnknownResources(
  resources: KubeJsUnknownResource[]
): CompactProbeUnknownResource[] {
  return resources.map((resource) => ({
    extractorId: resource.extractorId,
    sourceFormat: resource.sourceFormat,
    confidence: resource.confidence,
    reason: resource.reason,
    file: resource.file.relativePath,
    preview: resource.preview
  }));
}
