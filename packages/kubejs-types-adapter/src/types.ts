export type KubeJsTypeRootKind = "workspace-local" | "kubejs-nested";

export type KubeJsTypeSourceKind =
  | "dts"
  | "snippet"
  | "item"
  | "registry"
  | "other";

export interface KubeJsTypeRoot {
  absolutePath: string;
  relativePath: string;
  rootKind: KubeJsTypeRootKind;
}

export interface KubeJsTypeResourceFile {
  absolutePath: string;
  relativePath: string;
  sourceKind: KubeJsTypeSourceKind;
  sizeBytes: number;
  mtimeMs: number;
  rootKind: KubeJsTypeRootKind;
}

export interface KubeJsTypeDiscoverySummary {
  rootCount: number;
  fileCount: number;
  bySourceKind: Record<KubeJsTypeSourceKind, number>;
  truncated: boolean;
  skippedFiles: number;
}

export interface KubeJsTypeDiscoveryResult {
  workspaceRoot: string;
  roots: KubeJsTypeRoot[];
  files: KubeJsTypeResourceFile[];
  summary: KubeJsTypeDiscoverySummary;
}

export interface DiscoverKubeJsTypeResourcesOptions {
  workspaceRoot: string;
  maxFiles?: number;
}

export interface SearchKubeJsTypeResourcesOptions {
  workspaceRoot: string;
  query: string;
  limit?: number;
  maxFiles?: number;
  maxBytesPerFile?: number;
}

export interface KubeJsTypeSearchMatch {
  file: KubeJsTypeResourceFile;
  lineNumber: number;
  line: string;
}

export interface KubeJsTypeSearchResult {
  query: string;
  matches: KubeJsTypeSearchMatch[];
  searchedFiles: number;
  truncated: boolean;
}

export interface ReadKubeJsTypeResourceOptions {
  workspaceRoot: string;
  absolutePath?: string;
  relativePath?: string;
  maxBytes?: number;
}

export interface KubeJsTypeReadResult {
  file: KubeJsTypeResourceFile;
  content: string;
  bytesRead: number;
  truncated: boolean;
}

export type KubeJsSemanticResourceKind =
  | "class"
  | "language_key"
  | "snippet"
  | "item"
  | "registry"
  | "fluid"
  | "tag";

export type KubeJsSemanticSourceFormat =
  | "probe-class-definitions-json"
  | "probe-classes-text"
  | "probe-registry-definitions-json"
  | "text-line-list"
  | "vscode-fluid-attributes-json"
  | "vscode-item-attributes-json"
  | "vscode-item-tag-attributes-json"
  | "vscode-lang-keys-json"
  | "vscode-code-snippets-json";

export interface KubeJsSemanticResourceEntry {
  sourceKind: KubeJsSemanticResourceKind;
  extractorId: string;
  sourceFormat: KubeJsSemanticSourceFormat;
  confidence: number;
  name: string;
  value: string;
  file: KubeJsTypeResourceFile;
  lineNumber?: number;
  warnings?: string[];
  metadata?: {
    description?: string;
    bucketItem?: string;
    itemCount?: number;
    label?: string;
    packageName?: string;
    registryType?: string;
    selectedLanguage?: string;
    simpleName?: string;
  };
}

export interface KubeJsUnknownResource {
  extractorId: "unknown-probe-resource-preview-v1";
  sourceFormat: "unknown-json" | "unknown-text";
  confidence: number;
  reason: "unknown_probejs_resource_format";
  file: KubeJsTypeResourceFile;
  preview: string;
}

export interface SummarizeKubeJsTypeResourcesOptions {
  workspaceRoot: string;
  includeUnknownResources?: boolean;
  maxFiles?: number;
  maxBytesPerFile?: number;
  maxSnippetBytes?: number;
  maxAttributeBytes?: number;
  maxEntriesPerKind?: number;
  maxUnknownResources?: number;
  resourceQueries?: string[];
  unknownPreviewBytes?: number;
}

export interface KubeJsTypeSemanticSummary {
  workspaceRoot: string;
  entries: Record<KubeJsSemanticResourceKind, KubeJsSemanticResourceEntry[]>;
  unknownResources: KubeJsUnknownResource[];
  summary: {
    counts: Record<KubeJsSemanticResourceKind, number>;
    discoveredFiles: number;
    searchedFiles: number;
    unknownCount: number;
    truncated: boolean;
  };
}
