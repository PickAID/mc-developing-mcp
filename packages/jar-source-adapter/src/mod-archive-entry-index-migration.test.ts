import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { queryCachedModArchiveEntries } from "./mod-archive-entry-index.js";

const require = createRequire(import.meta.url);
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("queryCachedModArchiveEntries migration", () => {
  it("migrates legacy SQLite entry indexes that do not have data_kind", async () => {
    const workspaceRoot = await createWorkspace();
    const databasePath = join(workspaceRoot, ".mcpskill", "mod-archives.sqlite");
    await createLegacyEntryIndexDatabase(databasePath);

    await expect(
      queryCachedModArchiveEntries({
        workspaceRoot,
        databasePath,
        domains: ["data"],
        limit: 0
      })
    ).resolves.toMatchObject({
      dataSummary: {
        dataEntryCount: 1,
        byKind: {
          recipes: 1
        }
      }
    });
  });
});

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-entry-index-"));
  tempRoots.push(workspaceRoot);
  await mkdir(join(workspaceRoot, "mods"), { recursive: true });
  await writeFile(join(workspaceRoot, "mods", "content-mod.jar"), createZip());
  return workspaceRoot;
}

async function createLegacyEntryIndexDatabase(databasePath: string): Promise<void> {
  await mkdir(join(databasePath, ".."), { recursive: true });
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void };
  };
  const database = new sqlite.DatabaseSync(databasePath);

  try {
    database.exec(`
      CREATE TABLE mod_archive_entry_index_archives (
        source_archive TEXT PRIMARY KEY,
        archive_key TEXT NOT NULL,
        archive_relative_path TEXT NOT NULL,
        fingerprint_json TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE TABLE mod_archive_entry_index_entries (
        archive_key TEXT NOT NULL,
        source_archive TEXT NOT NULL,
        archive_relative_path TEXT NOT NULL,
        embedded_archive_path TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        domain TEXT NOT NULL,
        asset_kind TEXT NOT NULL DEFAULT '',
        size_bytes INTEGER NOT NULL
      );
    `);
  } finally {
    database.close();
  }
}

function createZip(): Buffer {
  const name = Buffer.from("data/demo/recipes/gear.json");
  const content = Buffer.from("{\"result\":\"demo:gear\"}\n");
  const localHeader = Buffer.alloc(30);
  const centralHeader = Buffer.alloc(46);

  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt32LE(content.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt32LE(content.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);

  const eocd = Buffer.alloc(22);
  const localFile = Buffer.concat([localHeader, name, content]);
  const centralDirectory = Buffer.concat([centralHeader, name]);

  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFile.length, 16);

  return Buffer.concat([localFile, centralDirectory, eocd]);
}
