export interface VanillaSourceReference {
  path: string;
  relativePath: string;
  content: string;
  reason: string;
  startLine?: number;
  endLine?: number;
  totalLines?: number;
  chunkId?: string;
  matchReasons?: string[];
  nextReads?: string[];
}
