import {
  discoverKubeJsTypeResources,
  summarizeKubeJsTypeResources,
  type KubeJsTypeResourceFile,
  type KubeJsTypeSemanticSummary,
  type SummarizeKubeJsTypeResourcesOptions
} from "minecraft-developing-mcp-kubejs-types-adapter";

export interface ProbeResourceSummaryCacheOptions {
  maxEntries?: number;
}

export interface ProbeResourceSummaryCache {
  get(key: string): KubeJsTypeSemanticSummary | undefined;
  set(key: string, value: KubeJsTypeSemanticSummary): void;
  size(): number;
  clear(): void;
}

export function createProbeResourceSummaryCache(
  options: ProbeResourceSummaryCacheOptions = {}
): ProbeResourceSummaryCache {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 4));
  const entries = new Map<string, KubeJsTypeSemanticSummary>();

  return {
    get(key) {
      const existing = entries.get(key);
      if (!existing) {
        return undefined;
      }

      entries.delete(key);
      entries.set(key, existing);
      return existing;
    },

    set(key, value) {
      entries.set(key, value);
      evictOverflow(entries, maxEntries);
    },

    size() {
      return entries.size;
    },

    clear() {
      entries.clear();
    }
  };
}

export async function summarizeProbeResourcesWithCache(
  options: SummarizeKubeJsTypeResourcesOptions & {
    cache?: ProbeResourceSummaryCache;
  }
): Promise<{ summary: KubeJsTypeSemanticSummary; cacheHit: boolean }> {
  if (!options.cache) {
    return {
      summary: await summarizeKubeJsTypeResources(options),
      cacheHit: false
    };
  }

  const key = await buildProbeResourceSummaryCacheKey(options);
  const cached = options.cache.get(key);
  if (cached) {
    return { summary: cached, cacheHit: true };
  }

  const summary = await summarizeKubeJsTypeResources(options);
  options.cache.set(key, summary);
  return { summary, cacheHit: false };
}

async function buildProbeResourceSummaryCacheKey(
  options: SummarizeKubeJsTypeResourcesOptions
): Promise<string> {
  const discovery = await discoverKubeJsTypeResources({
    workspaceRoot: options.workspaceRoot,
    maxFiles: options.maxFiles
  });
  const resourceQueries = normalizeResourceQueries(options.resourceQueries);
  const includeUnknownResources =
    options.includeUnknownResources ?? resourceQueries.length === 0;

  return JSON.stringify({
    workspaceRoot: discovery.workspaceRoot,
    files: discovery.files.map(fingerprintProbeResourceFile),
    options: {
      includeUnknownResources,
      maxAttributeBytes: options.maxAttributeBytes,
      maxBytesPerFile: options.maxBytesPerFile,
      maxEntriesPerKind: options.maxEntriesPerKind,
      maxFiles: options.maxFiles,
      maxSnippetBytes: options.maxSnippetBytes,
      maxUnknownResources: options.maxUnknownResources,
      resourceKinds: options.resourceKinds,
      resourceQueries,
      unknownPreviewBytes: options.unknownPreviewBytes
    }
  });
}

function fingerprintProbeResourceFile(file: KubeJsTypeResourceFile): string {
  return [
    file.relativePath,
    file.sourceKind,
    file.rootKind,
    file.sizeBytes,
    file.mtimeMs
  ].join(":");
}

function normalizeResourceQueries(queries: string[] | undefined): string[] {
  if (!queries) {
    return [];
  }

  return [...new Set(
    queries
      .flatMap((query) => query.split(/\s+/))
      .map((query) => query.trim().toLowerCase())
      .filter((query) => query.length >= 3)
  )].sort();
}

function evictOverflow(
  entries: Map<string, KubeJsTypeSemanticSummary>,
  maxEntries: number
): void {
  while (entries.size > maxEntries) {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (oldestKey === undefined) {
      return;
    }
    entries.delete(oldestKey);
  }
}
