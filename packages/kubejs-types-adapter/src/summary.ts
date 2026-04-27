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
  const unknownResources: KubeJsUnknownResource[] = [];
  const resourceQueries = normalizeSemanticResourceQueries(options.resourceQueries);
  const includeUnknownResources =
    options.includeUnknownResources ?? resourceQueries.length === 0;
  const maxEntriesPerKind = normalizeBudget(options.maxEntriesPerKind, 20);
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
        extractKubeJsSemanticResourceEntries(file, read.text),
        maxEntriesPerKind,
        resourceQueries
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
    unknownResources,
    summary: {
      counts: countEntries(entries),
      discoveredFiles: discovery.files.length,
      searchedFiles,
      unknownCount: unknownResources.length,
      truncated
    }
  };
}

function pushEntries(
  entries: Record<KubeJsSemanticResourceKind, KubeJsSemanticResourceEntry[]>,
  newEntries: KubeJsSemanticResourceEntry[],
  maxEntriesPerKind: number,
  resourceQueries: string[]
): boolean {
  let truncated = false;

  for (const entry of newEntries) {
    if (!semanticEntryMatchesQueries(entry, resourceQueries)) {
      continue;
    }
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

function normalizeBudget(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}
