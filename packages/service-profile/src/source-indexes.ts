import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function findSourceIndexDatabases(
  runtimeRoot: string | undefined,
  maxDatabases: number
): Promise<string[]> {
  if (!runtimeRoot) {
    return [];
  }

  const queue = [runtimeRoot];
  const databases: string[] = [];

  while (queue.length > 0 && databases.length < maxDatabases) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const entries = await readDirectoryIfPresent(current);
    for (const entry of entries) {
      const path = join(current, entry.name);

      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name)) {
          queue.push(path);
        }
        continue;
      }

      if (entry.isFile() && entry.name === "source-index.sqlite") {
        databases.push(path);
        if (databases.length >= maxDatabases) {
          break;
        }
      }
    }
  }

  return databases.sort();
}

async function readDirectoryIfPresent(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function shouldSkipDirectory(name: string): boolean {
  return name === "node_modules" || name === ".git";
}
