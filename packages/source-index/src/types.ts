export type SourceIndexedFileKind =
  | "java"
  | "json"
  | "mcmeta"
  | "dts"
  | "script"
  | "function"
  | "lang"
  | "other";

export type SourceIndexJavaMemberKind = "field" | "constructor" | "method";

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
  javaMemberCount: number;
}

export interface SourceIndexQueryInput {
  databasePath: string;
  symbol?: string;
  member?: string;
  owner?: string;
  memberKind?: SourceIndexJavaMemberKind;
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
  ownerSimpleName?: string;
  ownerQualifiedName?: string;
  memberName?: string;
  memberKind?: SourceIndexJavaMemberKind;
  signature?: string;
  returnType?: string;
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

export interface ReadIndexedSourceChunkInput {
  databasePath: string;
  match: SourceIndexMatch;
}

export interface IndexedSourceFile {
  path: string;
  kind: SourceIndexedFileKind;
  startLine: number;
  endLine: number;
  totalLines: number;
  content: string;
}

export interface IndexedSourceChunk {
  path: string;
  chunkId: string;
  startLine: number;
  endLine: number;
  content: string;
}
