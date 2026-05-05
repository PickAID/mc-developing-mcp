export type SourceIndexedFileKind =
  | "java"
  | "json"
  | "mcmeta"
  | "dts"
  | "script"
  | "function"
  | "lang"
  | "other";

export interface SourceIndexBuildInput {
  sourceRoot: string;
  databasePath: string;
  packageId: string;
  maxFiles?: number;
  maxBytesPerFile?: number;
}

export interface SourceIndexBuildResult {
  databasePath: string;
  sourceRoot: string;
  packageId: string;
  fileCount: number;
  skippedFileCount: number;
  indexedTextFileCount: number;
  javaSymbolCount: number;
}

export interface SourceIndexQueryInput {
  databasePath: string;
  symbol?: string;
  text?: string;
  pathLike?: string;
  limit?: number;
}

export interface SourceIndexMatch {
  path: string;
  kind: SourceIndexedFileKind;
  sizeBytes: number;
  sha256: string;
  packageId?: string;
  packageName?: string;
  simpleName?: string;
  qualifiedName?: string;
  startLine?: number;
  endLine?: number;
  chunkId?: string;
  matchReasons?: string[];
}

export interface SourceIndexQueryResult {
  databasePath: string;
  matches: SourceIndexMatch[];
}

export interface ReadIndexedSourceFileInput {
  sourceRoot: string;
  databasePath: string;
  path: string;
  startLine?: number;
  maxLines?: number;
}

export interface IndexedSourceFile {
  path: string;
  kind: SourceIndexedFileKind;
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
}
