import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function findSourceIndexDatabases(
  runtimeRoot: string | undefined,
  maxDatabases: number,
  explicitDatabasePaths: string[] = []
): Promise<string[]> {
  const databases: string[] = [];
  for (const databasePath of explicitDatabasePaths) {
    if (databases.length >= maxDatabases) {
      break;
    }
    if (await isFile(databasePath)) {
      databases.push(databasePath);
    }
  }

  if (!runtimeRoot || databases.length >= maxDatabases) {
    return uniqueSorted(databases);
  }

  const queue = [runtimeRoot];
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

  return uniqueSorted(databases);
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

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
