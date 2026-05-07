import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SourceAcquisitionWorkItemHandlerResult } from "@mcpskill/source-package-manager";

export interface MappingIndexEntry {
  fromNamespace: string;
  toNamespace: string;
  fromName: string;
  toName: string;
  kind: "class" | "field" | "method";
  owner?: string;
  descriptor?: string;
}

export interface MappingIndexProviderRequest {
  minecraftVersion: string;
  mappingFamily: "yarn" | "parchment" | "mojmap";
}

export interface MappingIndexProviderResult {
  provenance?: unknown;
  cacheable?: boolean;
  entries: MappingIndexEntry[];
}

export type MappingIndexProvider = (
  request: MappingIndexProviderRequest
) => Promise<MappingIndexProviderResult>;

export async function executeMcpServerMappingIndexWorkItem(input: {
  runtimeRoot: string;
  minecraftVersion: string;
  mappingFamily: "yarn" | "parchment" | "mojmap";
  provider?: MappingIndexProvider;
}): Promise<SourceAcquisitionWorkItemHandlerResult> {
  if (
    !isSafePathSegment(input.minecraftVersion) ||
    !isKnownMappingFamily(input.mappingFamily)
  ) {
    return {
      summary: "Mapping index request uses an unsafe cache key.",
      payload: {
        source: "source_acquisition_mapping_index",
        status: "invalid_cache_key",
        minecraftVersion: input.minecraftVersion,
        mappingFamily: input.mappingFamily,
        cache: {
          scope: "private_runtime"
        }
      }
    };
  }

  const indexPath = mappingIndexPath(input);
  const cached = await readCachedMappingIndex(indexPath, input);
  if (cached) {
    return mappingIndexResult({
      ...input,
      indexPath,
      entryCount: cached.entryCount,
      cacheHit: true,
      provenance: cached.provenance
    });
  }

  if (!input.provider) {
    return {
      summary: "Mapping index needs a provider before runtime cache materialization.",
      payload: {
        source: "source_acquisition_mapping_index",
        status: "provider_required",
        minecraftVersion: input.minecraftVersion,
        mappingFamily: input.mappingFamily,
        cache: {
          hit: false,
          scope: "private_runtime"
        }
      }
    };
  }

  const provided = await input.provider({
    minecraftVersion: input.minecraftVersion,
    mappingFamily: input.mappingFamily
  });
  if (provided.cacheable === false) {
    return mappingIndexUnavailableResult({
      ...input,
      provenance: provided.provenance
    });
  }

  await writeMappingIndex(indexPath, provided, {
    minecraftVersion: input.minecraftVersion,
    mappingFamily: input.mappingFamily
  });

  return mappingIndexResult({
    ...input,
    indexPath,
    entryCount: provided.entries.length,
    cacheHit: false,
    provenance: provided.provenance
  });
}

function mappingIndexPath(input: {
  runtimeRoot: string;
  minecraftVersion: string;
  mappingFamily: string;
}): string {
  return join(
    input.runtimeRoot,
    "source-acquisition",
    "mapping-indexes",
    input.mappingFamily,
    input.minecraftVersion,
    "mappings.jsonl"
  );
}

async function readCachedMappingIndex(
  path: string,
  expected: {
    minecraftVersion: string;
    mappingFamily: "yarn" | "parchment" | "mojmap";
  }
): Promise<
  | {
      entryCount: number;
      provenance?: unknown;
    }
  | undefined
> {
  const content = await readFile(path, "utf-8").catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!content) {
    return undefined;
  }

  const lines = content.split("\n").filter((line) => line.length > 0);
  const header = lines[0] ? parseJsonLine(lines[0]) : undefined;
  if (
    !isMappingIndexHeader(header, expected.minecraftVersion, expected.mappingFamily)
  ) {
    return undefined;
  }

  const entries = lines.slice(1).map(parseJsonLine);
  if (!entries.every(isMappingEntryRecord)) {
    return undefined;
  }

  return {
    entryCount: entries.length,
    provenance: header?.provenance
  };
}

async function writeMappingIndex(
  path: string,
  input: MappingIndexProviderResult,
  target: {
    minecraftVersion: string;
    mappingFamily: "yarn" | "parchment" | "mojmap";
  }
): Promise<void> {
  const lines = [
    JSON.stringify({
      recordKind: "mapping_index_header",
      minecraftVersion: target.minecraftVersion,
      mappingFamily: target.mappingFamily,
      provenance: input.provenance ?? null
    }),
    ...input.entries.map((entry) =>
      JSON.stringify({ recordKind: "mapping_entry", ...entry })
    )
  ];

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${lines.join("\n")}\n`);
}

function isSafePathSegment(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function isMappingIndexHeader(
  value: unknown,
  minecraftVersion: string,
  mappingFamily: "yarn" | "parchment" | "mojmap"
): value is {
  recordKind: "mapping_index_header";
  minecraftVersion: string;
  mappingFamily: "yarn" | "parchment" | "mojmap";
  provenance?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "recordKind" in value &&
    value.recordKind === "mapping_index_header" &&
    "minecraftVersion" in value &&
    value.minecraftVersion === minecraftVersion &&
    "mappingFamily" in value &&
    value.mappingFamily === mappingFamily
  );
}

function isKnownMappingFamily(
  value: unknown
): value is "yarn" | "parchment" | "mojmap" {
  return value === "yarn" || value === "parchment" || value === "mojmap";
}

function isMappingEntryRecord(value: unknown): value is {
  recordKind: "mapping_entry";
  fromNamespace: string;
  toNamespace: string;
  fromName: string;
  toName: string;
  kind: "class" | "field" | "method";
  owner?: string;
  descriptor?: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "recordKind" in value &&
    value.recordKind === "mapping_entry" &&
    "fromNamespace" in value &&
    typeof value.fromNamespace === "string" &&
    "toNamespace" in value &&
    typeof value.toNamespace === "string" &&
    "fromName" in value &&
    typeof value.fromName === "string" &&
    "toName" in value &&
    typeof value.toName === "string" &&
    "kind" in value &&
    (value.kind === "class" || value.kind === "field" || value.kind === "method") &&
    (!("owner" in value) || typeof value.owner === "string") &&
    (!("descriptor" in value) || typeof value.descriptor === "string")
  );
}

function mappingIndexResult(input: {
  minecraftVersion: string;
  mappingFamily: "yarn" | "parchment" | "mojmap";
  indexPath: string;
  entryCount: number;
  cacheHit: boolean;
  provenance?: unknown;
}): SourceAcquisitionWorkItemHandlerResult {
  return {
    summary: `Materialized ${input.entryCount} ${input.mappingFamily} mapping entr${input.entryCount === 1 ? "y" : "ies"}.`,
    payload: {
      source: "source_acquisition_mapping_index",
      status: "ready",
      minecraftVersion: input.minecraftVersion,
      mappingFamily: input.mappingFamily,
      entryCount: input.entryCount,
      indexPath: input.indexPath,
      provenance: input.provenance,
      cache: {
        hit: input.cacheHit,
        scope: "private_runtime",
        commitPolicy: "private_generated_cache"
      }
    }
  };
}

function mappingIndexUnavailableResult(input: {
  minecraftVersion: string;
  mappingFamily: "yarn" | "parchment" | "mojmap";
  provenance?: unknown;
}): SourceAcquisitionWorkItemHandlerResult {
  return {
    summary: "Mapping index provider did not return cacheable mapping entries.",
    payload: {
      source: "source_acquisition_mapping_index",
      status: "provider_unavailable",
      minecraftVersion: input.minecraftVersion,
      mappingFamily: input.mappingFamily,
      provenance: input.provenance,
      cache: {
        hit: false,
        scope: "private_runtime",
        commitPolicy: "not_cached"
      }
    }
  };
}
