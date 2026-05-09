import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export async function resolveMcpDevelopSourceIndexDatabasePaths(input: {
  runtimeRoot: string;
  mdmSourceIndexDatabasePaths: string[];
}): Promise<string[]> {
  const databases = [...input.mdmSourceIndexDatabasePaths];
  const queue = [input.runtimeRoot];

  while (queue.length > 0 && databases.length < 32) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    for (const entry of await readDirectoryIfPresent(current)) {
      const path = join(current, entry.name);

      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== ".git") {
          queue.push(path);
        }
        continue;
      }

      if (entry.isFile() && entry.name === "source-index.sqlite") {
        databases.push(path);
      }
    }
  }

  return (await uniqueExistingFiles(databases)).slice(0, 32);
}

async function readDirectoryIfPresent(directory: string) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function uniqueExistingFiles(paths: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const path of [...new Set(paths)].sort()) {
    try {
      if ((await stat(path)).isFile()) {
        existing.push(path);
      }
    } catch {
      // Ignore stale optional indexes; executors still handle unreadable paths defensively.
    }
  }
  return existing;
}
