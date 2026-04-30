import {
  createEmptyModArchiveAssetSummary,
  isUiModArchiveAssetKind,
  parseModArchiveAssetKind,
  type ModArchiveAssetKind,
  type ModArchiveAssetSummary
} from "./mod-archive-asset-kind.js";
import {
  createEmptyModArchiveDataSummary,
  isRegistryLikeModArchiveDataKind,
  parseModArchiveDataKind,
  type ModArchiveDataKind,
  type ModArchiveDataSummary
} from "./mod-archive-data-kind.js";
import type { ModArchiveEntryIndexDatabase } from "./mod-archive-entry-index-schema.js";

export interface ModArchiveEntryIndexSummaries {
  assetSummary: ModArchiveAssetSummary;
  dataSummary: ModArchiveDataSummary;
}

export function createEmptyModArchiveEntryIndexSummaries(): ModArchiveEntryIndexSummaries {
  return {
    assetSummary: createEmptyModArchiveAssetSummary(),
    dataSummary: createEmptyModArchiveDataSummary()
  };
}

export function readModArchiveEntryIndexSummaries(
  database: ModArchiveEntryIndexDatabase,
  filterSql: string,
  filterParameters: string[]
): ModArchiveEntryIndexSummaries {
  return {
    assetSummary: readAssetSummary(database, filterSql, filterParameters),
    dataSummary: readDataSummary(database, filterSql, filterParameters)
  };
}

function readAssetSummary(
  database: ModArchiveEntryIndexDatabase,
  filterSql: string,
  filterParameters: string[]
): ModArchiveAssetSummary {
  const byKind = readSummaryRows(
    database,
    "asset_kind",
    filterSql,
    filterParameters,
    parseModArchiveAssetKind
  );
  const entries = Object.entries(byKind) as Array<[ModArchiveAssetKind, number]>;

  return {
    assetEntryCount: entries.reduce((sum, [, count]) => sum + count, 0),
    uiAssetCount: entries
      .filter(([assetKind]) => isUiModArchiveAssetKind(assetKind))
      .reduce((sum, [, count]) => sum + count, 0),
    byKind
  };
}

function readDataSummary(
  database: ModArchiveEntryIndexDatabase,
  filterSql: string,
  filterParameters: string[]
): ModArchiveDataSummary {
  const byKind = readSummaryRows(
    database,
    "data_kind",
    filterSql,
    filterParameters,
    parseModArchiveDataKind
  );
  const entries = Object.entries(byKind) as Array<[ModArchiveDataKind, number]>;

  return {
    dataEntryCount: entries.reduce((sum, [, count]) => sum + count, 0),
    registryLikeCount: entries
      .filter(([dataKind]) => isRegistryLikeModArchiveDataKind(dataKind))
      .reduce((sum, [, count]) => sum + count, 0),
    byKind
  };
}

function readSummaryRows<TKind extends string>(
  database: ModArchiveEntryIndexDatabase,
  columnName: "asset_kind" | "data_kind",
  filterSql: string,
  filterParameters: string[],
  parseKind: (value: unknown) => TKind | undefined
): Partial<Record<TKind, number>> {
  const rows = database
    .prepare(
      [
        `SELECT ${columnName} AS kind, COUNT(*) AS kind_count`,
        "FROM mod_archive_entry_index_entries",
        filterSql,
        `AND ${columnName} != ''`,
        `GROUP BY ${columnName}`,
        `ORDER BY ${columnName}`
      ].join(" ")
    )
    .all(...filterParameters);
  const byKind: Partial<Record<TKind, number>> = {};

  for (const row of rows) {
    const kind = parseKind(row.kind);
    if (kind) {
      byKind[kind] = Number(row.kind_count);
    }
  }

  return byKind;
}
