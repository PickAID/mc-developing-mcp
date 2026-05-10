import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readMdmDocsResourceRecords,
  searchMdmDocsSqliteRecords
} from "./mdm-resource.js";

const require = createRequire(import.meta.url);

describe("MDM docs sqlite metadata", () => {
  it("preserves schema evidence metadata when reading sqlite docs entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sqlite-metadata-"));
    const artifactPath = join(root, "vanilla-schema-docs.sqlite");

    createDocsSqliteArtifact(artifactPath);

    await expect(
      readMdmDocsResourceRecords(artifactPath, {
        storageKind: "sqlite_bundle"
      })
    ).resolves.toEqual([
      expect.objectContaining({
        entryId: "vanilla-schema-docs-datapack-mcdoc-java-data-recipe",
        metadata: {
          schemaSymbol: {
            identifier: "java/data/recipe",
            kind: "struct"
          },
          upstreamPath: "mcdoc/dispatcher/data/recipe.mcdoc",
          contentHash: "sha256:test"
        }
      })
    ]);
  });

  it("preserves schema evidence metadata on sqlite search hits", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sqlite-search-metadata-"));
    const artifactPath = join(root, "vanilla-schema-docs.sqlite");

    createDocsSqliteArtifact(artifactPath, { fts: true });

    expect(searchMdmDocsSqliteRecords(artifactPath, "recipe", 5)).toEqual([
      expect.objectContaining({
        entryId: "vanilla-schema-docs-datapack-mcdoc-java-data-recipe",
        metadata: expect.objectContaining({
          upstreamPath: "mcdoc/dispatcher/data/recipe.mcdoc"
        })
      })
    ]);
  });
});

function createDocsSqliteArtifact(
  artifactPath: string,
  options: { fts?: boolean } = {}
): void {
  const sqlite = require("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      exec(sql: string): void;
      prepare(sql: string): {
        run(...values: unknown[]): void;
      };
      close(): void;
    };
  };
  const database = new sqlite.DatabaseSync(artifactPath);

  try {
    database.exec(`
      PRAGMA user_version = 3;
      CREATE TABLE docs_entries (
        entry_id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        path TEXT NOT NULL,
        headings TEXT NOT NULL,
        summary TEXT NOT NULL,
        search_terms TEXT NOT NULL,
        script_scopes TEXT NOT NULL,
        addon_names TEXT NOT NULL,
        event_names TEXT NOT NULL,
        code_symbols TEXT NOT NULL,
        metadata TEXT
      );
    `);
    database
      .prepare(
        `INSERT INTO docs_entries (
          entry_id, package_id, kind, title, path, headings, summary,
          search_terms, script_scopes, addon_names, event_names, code_symbols,
          metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "vanilla-schema-docs-datapack-mcdoc-java-data-recipe",
        "vanilla-schema-docs",
        "format-reference",
        "Datapack recipe schema",
        "packages/docs/vanilla-schema-docs/payload/explanations.json#recipe",
        JSON.stringify(["datapack", "recipe"]),
        "Recipe schema generated from vanilla-mcdoc symbols.",
        JSON.stringify(["recipe", "schema", "mcdoc"]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify(["java/data/recipe"]),
        JSON.stringify({
          schemaSymbol: {
            identifier: "java/data/recipe",
            kind: "struct"
          },
          upstreamPath: "mcdoc/dispatcher/data/recipe.mcdoc",
          contentHash: "sha256:test"
        })
      );
    if (options.fts === true) {
      database.exec(`
        CREATE VIRTUAL TABLE docs_entries_fts USING fts5(
          entry_id UNINDEXED,
          title,
          path,
          summary,
          search_terms,
          script_scopes,
          addon_names,
          event_names,
          code_symbols
        );
      `);
      database
        .prepare(
          `INSERT INTO docs_entries_fts (
            entry_id, title, path, summary, search_terms, script_scopes,
            addon_names, event_names, code_symbols
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "vanilla-schema-docs-datapack-mcdoc-java-data-recipe",
          "Datapack recipe schema",
          "packages/docs/vanilla-schema-docs/payload/explanations.json#recipe",
          "Recipe schema generated from vanilla-mcdoc symbols.",
          JSON.stringify(["recipe", "schema", "mcdoc"]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify(["java/data/recipe"])
        );
    }
  } finally {
    database.close();
  }
}
