import { discoverKubeJsTypeResources } from "./discovery.js";
import { readBudgetedUtf8 } from "./read.js";
import {
  canExtractKubeJsSemanticResource,
  createEmptySemanticEntries,
  extractKubeJsSemanticResourceEntries,
  semanticReadBudget
} from "./semantic-extractors.js";
import {
  normalizeSemanticResourceQueries,
  semanticEntryMatchesQueries
} from "./semantic-query.js";
import type {
  KubeJsSemanticResourceEntry,
  KubeJsSemanticResourceKind,
  KubeJsTypeResourceFile,
  KubeJsTypeSemanticSummary,
  KubeJsUnknownResource,
  SummarizeKubeJsTypeResourcesOptions
} from "./types.js";

export async function summarizeKubeJsTypeResources(
  options: SummarizeKubeJsTypeResourcesOptions
): Promise<KubeJsTypeSemanticSummary> {
  const discovery = await discoverKubeJsTypeResources({
    workspaceRoot: options.workspaceRoot,
    maxFiles: options.maxFiles
  });
  const entries = createEmptySemanticEntries();
  const totalEntryNames = createEmptySemanticEntryNameSets();
  const unknownResources: KubeJsUnknownResource[] = [];
  const resourceQueries = normalizeSemanticResourceQueries(options.resourceQueries);
  const resourceKinds = normalizeResourceKinds(options.resourceKinds);
  const includeUnknownResources =
    options.includeUnknownResources ?? resourceQueries.length === 0;
  const maxEntriesPerKind = normalizeOptionalBudget(options.maxEntriesPerKind);
  const maxUnknownResources = normalizeBudget(options.maxUnknownResources, 5);
  let searchedFiles = 0;
  let truncated = discovery.summary.truncated;

  for (const file of discovery.files) {
    if (canExtractKubeJsSemanticResource(file)) {
      const read = await readBudgetedUtf8(
        file.absolutePath,
        semanticReadBudget(file, options)
      );
      searchedFiles += 1;
      truncated = truncated || read.truncated;
      truncated = pushEntries(
        entries,
        totalEntryNames,
        extractKubeJsSemanticResourceEntries(file, read.text),
        maxEntriesPerKind,
        resourceQueries,
        resourceKinds
      ) || truncated;
      continue;
    }

    if (includeUnknownResources && file.sourceKind === "other") {
      const collected = await collectUnknownResource(
        file,
        unknownResources,
        maxUnknownResources,
        options
      );
      searchedFiles += collected.searchedFiles;
      truncated = truncated || collected.truncated;
    }
  }

  return {
    workspaceRoot: discovery.workspaceRoot,
    entries,
    capabilityUsage: buildCapabilityUsage(entries),
    unknownResources,
    summary: {
      counts: countEntries(entries),
      totalCounts: countTotalEntries(totalEntryNames),
      discoveredFiles: discovery.files.length,
      searchedFiles,
      unknownCount: unknownResources.length,
      truncated
    }
  };
}

function buildCapabilityUsage(
  entries: Record<KubeJsSemanticResourceKind, KubeJsSemanticResourceEntry[]>
) {
  return {
    capability: "probejs_resource_summary" as const,
    resourceUseCases: SEMANTIC_RESOURCE_USE_CASES.filter(
      (useCase) => entries[useCase.sourceKind].length > 0
    )
  };
}

const SEMANTIC_RESOURCE_USE_CASES: Array<{
  sourceKind: KubeJsSemanticResourceKind;
  useFor: string[];
  kubeJsContexts: string[];
}> = [
  {
    sourceKind: "item",
    useFor: ["validate item ids", "build recipe inputs and outputs"],
    kubeJsContexts: ["ServerEvents.recipes", "Item.of", "Ingredient.of"]
  },
  {
    sourceKind: "recipe",
    useFor: ["validate recipe ids", "select recipe serializers or recipe types"],
    kubeJsContexts: ["ServerEvents.recipes", "event.custom", "event.remove"]
  },
  {
    sourceKind: "tag",
    useFor: ["validate tag ids", "select item groups for recipes or logic"],
    kubeJsContexts: ["recipe ingredients", "event filters", "datapack tags"]
  },
  {
    sourceKind: "fluid",
    useFor: ["validate fluid ids", "map fluids to buckets or fluid recipes"],
    kubeJsContexts: ["fluid ingredients", "machine recipes", "fluid events"]
  },
  {
    sourceKind: "registry",
    useFor: ["confirm registry keys", "choose the right registry namespace"],
    kubeJsContexts: ["StartupEvents.registry", "registry lookups"]
  },
  {
    sourceKind: "snippet",
    useFor: ["discover KubeJS event entrypoints", "reuse generated DSL shapes"],
    kubeJsContexts: ["server_scripts", "startup_scripts", "client_scripts"]
  },
  {
    sourceKind: "class",
    useFor: ["resolve Java class names", "cross-check native API types"],
    kubeJsContexts: ["Java.loadClass", "NativeEvents", "typed callbacks"]
  },
  {
    sourceKind: "language_key",
    useFor: ["check translation keys", "match display names to ids"],
    kubeJsContexts: ["lang generation", "tooltip logic", "UI text"]
  }
];

function pushEntries(
  entries: Record<KubeJsSemanticResourceKind, KubeJsSemanticResourceEntry[]>,
  totalEntryNames: Record<KubeJsSemanticResourceKind, Set<string>>,
  newEntries: KubeJsSemanticResourceEntry[],
  maxEntriesPerKind: number,
  resourceQueries: string[],
  resourceKinds: Set<KubeJsSemanticResourceKind> | undefined
): boolean {
  let truncated = false;

  for (const entry of newEntries) {
    if (resourceKinds && !resourceKinds.has(entry.sourceKind)) {
      continue;
    }
    if (!semanticEntryMatchesQueries(entry, resourceQueries)) {
      continue;
    }
    totalEntryNames[entry.sourceKind].add(entry.name);
    const existingIndex = entries[entry.sourceKind].findIndex(
      (existing) => existing.name === entry.name
    );
    if (existingIndex >= 0) {
      if (entry.confidence > entries[entry.sourceKind][existingIndex].confidence) {
        entries[entry.sourceKind][existingIndex] = entry;
      }
      continue;
    }
    if (entries[entry.sourceKind].length >= maxEntriesPerKind) {
      truncated = true;
      continue;
    }
    entries[entry.sourceKind].push(entry);
  }

  return truncated;
}

function createEmptySemanticEntryNameSets(): Record<
  KubeJsSemanticResourceKind,
  Set<string>
> {
  return Object.fromEntries(
    Object.keys(createEmptySemanticEntries()).map((kind) => [kind, new Set()])
  ) as Record<KubeJsSemanticResourceKind, Set<string>>;
}

async function collectUnknownResource(
  file: KubeJsTypeResourceFile,
  unknownResources: KubeJsUnknownResource[],
  maxUnknownResources: number,
  options: SummarizeKubeJsTypeResourcesOptions
): Promise<{ searchedFiles: number; truncated: boolean }> {
  if (unknownResources.length >= maxUnknownResources) {
    return { searchedFiles: 0, truncated: true };
  }

  const read = await readBudgetedUtf8(
    file.absolutePath,
    options.unknownPreviewBytes ?? 240
  );
  unknownResources.push({
    extractorId: "unknown-probe-resource-preview-v1",
    sourceFormat: file.relativePath.endsWith(".json")
      ? "unknown-json"
      : "unknown-text",
    confidence: 0.2,
    reason: "unknown_probejs_resource_format",
    file,
    preview: read.text
  });

  return { searchedFiles: 1, truncated: read.truncated };
}

function countEntries(
  entries: Record<KubeJsSemanticResourceKind, KubeJsSemanticResourceEntry[]>
): Record<KubeJsSemanticResourceKind, number> {
  return Object.fromEntries(
    Object.entries(entries).map(([kind, values]) => [kind, values.length])
  ) as Record<KubeJsSemanticResourceKind, number>;
}

function countTotalEntries(
  entries: Record<KubeJsSemanticResourceKind, Set<string>>
): Record<KubeJsSemanticResourceKind, number> {
  return Object.fromEntries(
    Object.entries(entries).map(([kind, values]) => [kind, values.size])
  ) as Record<KubeJsSemanticResourceKind, number>;
}

function normalizeBudget(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeOptionalBudget(value: number | undefined): number {
  if (value === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeResourceKinds(
  kinds: KubeJsSemanticResourceKind[] | undefined
): Set<KubeJsSemanticResourceKind> | undefined {
  if (!kinds || kinds.length === 0) {
    return undefined;
  }

  return new Set(kinds);
}
