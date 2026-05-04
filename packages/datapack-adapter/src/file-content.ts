import { readFile } from "node:fs/promises";

import type {
  DatapackFileEntry,
  DatapackSkippedFile
} from "./types.js";

export const DEFAULT_MAX_BYTES_PER_FILE = 1024 * 1024;

export async function readTextEntry(
  entry: DatapackFileEntry,
  maxBytesPerFile = DEFAULT_MAX_BYTES_PER_FILE
): Promise<string | DatapackSkippedFile> {
  if (entry.sizeBytes > maxBytesPerFile) {
    return skippedFromEntry(entry, "too-large");
  }

  try {
    const content = await readFile(entry.absolutePath);

    if (isBinary(content)) {
      return skippedFromEntry(entry, "binary");
    }

    return content.toString("utf-8");
  } catch {
    return skippedFromEntry(entry, "unreadable");
  }
}

export function findInContent(content: string, query: string) {
  const index = content.indexOf(query);
  if (index < 0) {
    return undefined;
  }

  const before = content.slice(0, index);
  const lines = before.split("\n");

  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
    preview: content.split("\n")[lines.length - 1] ?? ""
  };
}

export function skippedFromEntry(
  entry: DatapackFileEntry,
  reason: DatapackSkippedFile["reason"]
): DatapackSkippedFile {
  return {
    absolutePath: entry.absolutePath,
    relativePath: entry.relativePath,
    reason
  };
}

function isBinary(content: Buffer): boolean {
  if (content.includes(0)) {
    return true;
  }

  const sampleLength = Math.min(content.length, 512);
  let controlCharacters = 0;

  for (let index = 0; index < sampleLength; index += 1) {
    const byte = content[index];
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      controlCharacters += 1;
    }
  }

  return sampleLength > 0 && controlCharacters / sampleLength > 0.1;
}
