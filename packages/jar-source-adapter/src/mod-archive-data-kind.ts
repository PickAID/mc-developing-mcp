export type ModArchiveDataKind =
  | "advancements"
  | "functions"
  | "item_modifiers"
  | "loot_tables"
  | "predicates"
  | "recipes"
  | "registry"
  | "structures"
  | "tags"
  | "worldgen";

export interface ModArchiveDataSummary {
  dataEntryCount: number;
  registryLikeCount: number;
  byKind: Partial<Record<ModArchiveDataKind, number>>;
}

const DATA_KINDS = new Set<ModArchiveDataKind>([
  "advancements",
  "functions",
  "item_modifiers",
  "loot_tables",
  "predicates",
  "recipes",
  "registry",
  "structures",
  "tags",
  "worldgen"
]);
const REGISTRY_LIKE_DATA_KINDS = new Set<ModArchiveDataKind>([
  "advancements",
  "item_modifiers",
  "loot_tables",
  "predicates",
  "recipes",
  "registry",
  "tags",
  "worldgen"
]);

export function classifyModArchiveDataKind(
  relativePath: string
): ModArchiveDataKind | undefined {
  const segments = relativePath.split("/");
  if (segments[0] !== "data" || segments.length < 4) {
    return undefined;
  }

  const root = parseModArchiveDataKind(segments[2]);
  if (root) {
    return root;
  }

  return relativePath.endsWith(".json") ? "registry" : undefined;
}

export function parseModArchiveDataKind(
  value: unknown
): ModArchiveDataKind | undefined {
  return typeof value === "string" && DATA_KINDS.has(value as ModArchiveDataKind)
    ? (value as ModArchiveDataKind)
    : undefined;
}

export function createEmptyModArchiveDataSummary(): ModArchiveDataSummary {
  return {
    dataEntryCount: 0,
    registryLikeCount: 0,
    byKind: {}
  };
}

export function isRegistryLikeModArchiveDataKind(
  dataKind: ModArchiveDataKind
): boolean {
  return REGISTRY_LIKE_DATA_KINDS.has(dataKind);
}
