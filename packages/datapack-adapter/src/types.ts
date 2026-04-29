export type DatapackDomain = "data" | "assets";

export type DataKind =
  | "functions"
  | "recipes"
  | "tags"
  | "loot_tables"
  | "advancements"
  | "predicates"
  | "damage_type"
  | "worldgen"
  | "other";

export type AssetKind =
  | "atlases"
  | "blockstates"
  | "equipment"
  | "font"
  | "items"
  | "lang"
  | "models"
  | "pack_metadata"
  | "particles"
  | "post_effect"
  | "shaders"
  | "sounds"
  | "texts"
  | "textures"
  | "waypoint_style"
  | "other";

export type DatapackKind = DataKind | AssetKind;

export interface DatapackRoot {
  absolutePath: string;
  hasPackMcmeta: boolean;
  hasData: boolean;
  hasAssets: boolean;
}

export interface DatapackDiscovery {
  roots: DatapackRoot[];
  namespaces: string[];
  dataKinds: DataKind[];
  assetKinds: AssetKind[];
}

export interface DatapackFileEntry {
  absolutePath: string;
  relativePath: string;
  namespace: string;
  kind: DatapackKind;
  domain: DatapackDomain;
  sizeBytes: number;
}

export type DatapackSkipReason = "unreadable" | "binary" | "too-large";

export interface DatapackSkippedFile {
  absolutePath: string;
  relativePath: string;
  reason: DatapackSkipReason;
}

export interface DatapackBudget {
  limit?: number;
  maxFiles?: number;
  maxBytesPerFile?: number;
}

export interface DatapackFileList {
  entries: DatapackFileEntry[];
  skipped: DatapackSkippedFile[];
  truncated: boolean;
}

export interface DatapackFileSummary {
  rootCount: number;
  entryCount: number;
  byDomain: Partial<Record<DatapackDomain, number>>;
  byKind: Partial<Record<DatapackKind, number>>;
  byNamespace: Record<string, number>;
  skipped: DatapackSkippedFile[];
  truncated: boolean;
}

export interface DatapackSearchMatch {
  file: DatapackFileEntry;
  line: number;
  column: number;
  preview: string;
}

export interface DatapackSearchResult {
  matches: DatapackSearchMatch[];
  skipped: DatapackSkippedFile[];
  truncated: boolean;
}

export interface DatapackReadResult {
  file?: DatapackFileEntry;
  content?: string;
  skipped?: DatapackSkippedFile;
}

export type DatapackResourceReferenceRelation =
  | "blockstate_model"
  | "model_parent"
  | "model_texture";

export type DatapackResourceReferenceStatus = "resolved" | "missing";

export interface DatapackResourceReference {
  fromPath: string;
  fromKind: DatapackKind;
  relation: DatapackResourceReferenceRelation;
  value: string;
  toPath: string;
  toKind: DatapackKind;
  status: DatapackResourceReferenceStatus;
}

export interface DatapackResourceReferenceTraceOptions extends DatapackBudget {
  paths?: string[];
  maxDepth?: number;
  maxReferences?: number;
}

export interface DatapackResourceReferenceTrace {
  startPaths: string[];
  references: DatapackResourceReference[];
  unresolved: DatapackResourceReference[];
  skipped: DatapackSkippedFile[];
  truncated: boolean;
}
