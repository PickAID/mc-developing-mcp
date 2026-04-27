import { readdir, stat } from "node:fs/promises";
import { join, normalize, relative, resolve } from "node:path";

import { detectSourceIndexedFileKind, isTextIndexableKind } from "./kinds.js";
import type { SourceIndexedFileKind } from "./types.js";

export interface SourceIndexScanInput {
  sourceRoot: string;
  databasePath: string;
  maxFiles: number;
  maxBytesPerFile: number;
}

export interface SourceIndexScannedFile {
  absolutePath: string;
  relativePath: string;
  kind: SourceIndexedFileKind;
  sizeBytes: number;
  textIndexable: boolean;
}

export interface SourceIndexScanResult {
  files: SourceIndexScannedFile[];
  skippedFileCount: number;
}

export async function scanSourceIndexFiles(
  input: SourceIndexScanInput
): Promise<SourceIndexScanResult> {
  const sourceRoot = normalize(resolve(input.sourceRoot));
  const databasePath = normalize(resolve(input.databasePath));
  const queue = [sourceRoot];
  const files: SourceIndexScannedFile[] = [];
  let skippedFileCount = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const entries = await readDirectoryIfPresent(current);
    for (const entry of entries) {
      const absolutePath = join(current, entry.name);

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) {
          queue.push(absolutePath);
        }
        continue;
      }

      if (!entry.isFile() || normalize(resolve(absolutePath)) === databasePath) {
        continue;
      }

      const details = await stat(absolutePath);
      if (
        files.length >= input.maxFiles ||
        details.size > input.maxBytesPerFile
      ) {
        skippedFileCount += 1;
        continue;
      }

      const relativePath = relative(sourceRoot, absolutePath).replaceAll("\\", "/");
      const kind = detectSourceIndexedFileKind(relativePath);
      files.push({
        absolutePath,
        relativePath,
        kind,
        sizeBytes: details.size,
        textIndexable: isTextIndexableKind(kind)
      });
    }
  }

  return { files, skippedFileCount };
}

async function readDirectoryIfPresent(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isSkippablePathError(error)) {
      return [];
    }
    throw error;
  }
}

function shouldSkipDirectory(name: string): boolean {
  return name === ".git" || name === "node_modules" || name === "dist";
}

function isSkippablePathError(error: unknown): boolean {
  const code =
    error instanceof Error && "code" in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;

  return code === "ENOENT" || code === "ENOTDIR" || code === "EACCES";
}
