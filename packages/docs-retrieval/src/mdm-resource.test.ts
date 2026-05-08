import { mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readMdmDocsResourceRecords,
  searchMdmDocsSqliteRecords
} from "./mdm-resource.js";
import { searchSelectedDocsPackages } from "./search.js";

const require = createRequire(import.meta.url);

describe("MDM docs resource records", () => {
  it("reads structured docs records from a cached MDM resource artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-docs-"));
    const artifactPath = join(root, "core-docs-required-0.1.0.mdm-resource.json");

    await writeFile(artifactPath, JSON.stringify(fixtureArtifact(), null, 2));

    await expect(readMdmDocsResourceRecords(artifactPath)).resolves.toEqual([
      expect.objectContaining({
        entryId: "offline-resource-status",
        packageId: "core-docs-required",
        kind: "concept",
        title: "Offline Resource Status",
        path: "packages/core/docs/required/payload/core-docs.json#offline-resource-status",
        summary:
          "Missing optional packages are degraded capability, not fatal failure.",
        searchTerms: expect.arrayContaining([
          "offline-resource-status",
          "Offline Resource Status",
          "Missing optional packages are degraded capability, not fatal failure."
        ])
      })
    ]);
  });

  it("reads v2 guidance docs bundles without requiring entries arrays", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-guidance-"));
    const artifactPath = join(root, "client-visual-1.20.1-guidance-0.2.0.mdm-resource.json");

    await writeFile(
      artifactPath,
      JSON.stringify(fixtureV2GuidanceArtifact(), null, 2)
    );

    await expect(readMdmDocsResourceRecords(artifactPath)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: "client-visual-1.20.1-guidance-purpose",
          packageId: "client-visual-1.20.1-guidance",
          title: "Client Visual 1.20.1 Guidance Purpose",
          summary:
            "Translate low-knowledge visual requests into concrete Minecraft implementation evidence chains.",
          searchTerms: expect.arrayContaining([
            "client-visual-1.20.1-guidance",
            "resourcepack_trace",
            "block-entity-visual",
            "renderer implementation"
          ])
        }),
        expect.objectContaining({
          entryId: "client-visual-1.20.1-guidance-hard-rules",
          packageId: "client-visual-1.20.1-guidance",
          summary:
            "Do not invent renderer code without checking registry id, client binding, asset path, sync evidence, and loader/version API proof."
        })
      ])
    );
  });

  it("searches synthesized guidance docs by compact topic terms", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-guidance-search-"));
    const artifactPath = join(root, "client-visual-1.20.1-guidance-0.2.0.mdm-resource.json");

    await writeFile(
      artifactPath,
      JSON.stringify(fixtureV2GuidanceArtifact(), null, 2)
    );
    const records = await readMdmDocsResourceRecords(artifactPath);
    const result = searchSelectedDocsPackages({
      queryText: "dynamic texture reload cleanup and nine slice metadata",
      docsSelection: {
        selections: [],
        trace: {
          registryPackageIds: [],
          taskIntentId: "client_visual_resources",
          routeStep: "docs_lookup",
          rejectedPackages: []
        }
      },
      resourceRecords: records
    });

    expect(result.hits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entryId: "client-visual-1.20.1-guidance-purpose",
        matchedTerms: expect.arrayContaining([
          "dynamic texture",
          "reload cleanup",
          "nine slice"
        ])
      })
    ]));
  });

  it("reads structured docs records from a sqlite MDM docs artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-docs-sqlite-"));
    const artifactPath = join(root, "core-docs-required-0.1.0.sqlite");

    createDocsSqliteArtifact(artifactPath, {
      entryId: "kubejs-server-recipes",
      packageId: "core-docs-required",
      kind: "event-catalog",
      title: "KubeJS Server Recipes",
      path: "docs/kubejs/server-events.md#recipes",
      headings: ["ServerEvents", "Recipes"],
      summary: "Use ServerEvents.recipes in server_scripts for recipe edits.",
      searchTerms: ["recipes", "server_scripts", "ServerEvents.recipes"],
      scriptScopes: ["server_scripts"],
      addonNames: ["kubejs"],
      eventNames: ["ServerEvents.recipes"],
      codeSymbols: ["ServerEvents.recipes"]
    });

    await expect(
      readMdmDocsResourceRecords(artifactPath, {
        storageKind: "sqlite_bundle"
      })
    ).resolves.toEqual([
      {
        entryId: "kubejs-server-recipes",
        packageId: "core-docs-required",
        kind: "event-catalog",
        title: "KubeJS Server Recipes",
        path: "docs/kubejs/server-events.md#recipes",
        headings: ["ServerEvents", "Recipes"],
        summary: "Use ServerEvents.recipes in server_scripts for recipe edits.",
        searchTerms: ["recipes", "server_scripts", "ServerEvents.recipes"],
        scriptScopes: ["server_scripts"],
        addonNames: ["kubejs"],
        eventNames: ["ServerEvents.recipes"],
        codeSymbols: ["ServerEvents.recipes"]
      }
    ]);
  });

  it("searches sqlite docs entries with FTS without materializing all records", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-docs-fts-"));
    const artifactPath = join(root, "docs.sqlite");

    createDocsSqliteArtifact(artifactPath, sqliteEntry(), { fts: true });

    expect(searchMdmDocsSqliteRecords(artifactPath, "recipes", 5)).toEqual([
      expect.objectContaining({
        entryId: "kubejs-server-recipes",
        score: expect.any(Number),
        matchedTerms: expect.arrayContaining(["recipes"]),
        matchReasons: expect.arrayContaining([
          expect.stringMatching(/^search_term:/),
          expect.stringMatching(/^sqlite_fts:/)
        ])
      })
    ]);
  });

  it("falls back to docs_entries LIKE search when no FTS table exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-docs-like-"));
    const artifactPath = join(root, "docs.sqlite");

    createDocsSqliteArtifact(artifactPath, sqliteEntry());

    expect(searchMdmDocsSqliteRecords(artifactPath, "server_scripts", 5)).toEqual([
      expect.objectContaining({
        entryId: "kubejs-server-recipes",
        matchedTerms: expect.arrayContaining(["server_scripts"]),
        matchReasons: expect.arrayContaining([
          expect.stringMatching(/^search_term:/),
          expect.stringMatching(/^sqlite_like:/)
        ])
      })
    ]);
  });

  it("returns no sqlite docs hits when FTS has no match", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-docs-empty-"));
    const artifactPath = join(root, "docs.sqlite");

    createDocsSqliteArtifact(artifactPath, sqliteEntry(), { fts: true });

    expect(searchMdmDocsSqliteRecords(artifactPath, "dimension", 5)).toEqual([]);
  });

  it("searches resource records even when no builtin docs package was selected", async () => {
    const result = searchSelectedDocsPackages({
      queryText: "Explain offline resource status.",
      docsSelection: {
        selections: [],
        trace: {
          registryPackageIds: [],
          taskIntentId: "workspace_default",
          routeStep: "docs_lookup",
          rejectedPackages: []
        }
      },
      resourceRecords: [
        {
          entryId: "offline-resource-status",
          packageId: "core-docs-required",
          kind: "concept",
          title: "Offline Resource Status",
          path: "packages/core/docs/required/payload/core-docs.json#offline-resource-status",
          headings: [],
          summary:
            "Missing optional packages are degraded capability, not fatal failure.",
          searchTerms: [
            "offline-resource-status",
            "offline resource status",
            "degraded capability"
          ],
          scriptScopes: [],
          addonNames: [],
          eventNames: [],
          codeSymbols: []
        }
      ]
    });

    expect(result.hits).toEqual([
      expect.objectContaining({
        entryId: "offline-resource-status",
        packageId: "core-docs-required",
        matchedTerms: expect.arrayContaining(["offline resource status"])
      })
    ]);
    expect(result.trace).toMatchObject({
      selectedPackageIds: [],
      resourceEntryIds: ["offline-resource-status"],
      matchedEntryIds: ["offline-resource-status"]
    });
  });
});

function fixtureArtifact() {
  return {
    schemaVersion: 1,
    package: {
      id: "core-docs-required",
      artifactType: "docs"
    },
    payload: {
      "core-docs.json": {
        repoPath: "packages/core/docs/required/payload/core-docs.json",
        content: JSON.stringify({
          schemaVersion: 1,
          entries: [
            {
              id: "offline-resource-status",
              title: "Offline Resource Status",
              summary:
                "Missing optional packages are degraded capability, not fatal failure."
            }
          ]
        })
      }
    }
  };
}

function fixtureV2GuidanceArtifact() {
  return {
    schemaVersion: 1,
    package: {
      identity: {
        packageId: "client-visual-1.20.1-guidance",
        displayName: "Client Visual 1.20.1 Guidance",
        namespace: "client-visual"
      },
      artifact: {
        kind: "docs_bundle",
        format: "json"
      },
      capabilities: ["docs_search", "docs_direct_read", "resourcepack_trace"]
    },
    payload: {
      "payload/client-visual-guidance.json": {
        repoPath: "packages/docs/client-visual/1.20.1/payload/client-visual-guidance.json",
        content: JSON.stringify({
          schemaVersion: 1,
          minecraftVersion: "1.20.1",
          purpose:
            "Translate low-knowledge visual requests into concrete Minecraft implementation evidence chains.",
          implementationChains: [
            {
              id: "block-entity-visual",
              chain: [
                "registry id",
                "block entity type",
                "client renderer binding",
                "renderer implementation"
              ]
            }
          ],
          hardRules: [
            "Do not invent renderer code without checking registry id, client binding, asset path, sync evidence, and loader/version API proof."
          ],
          relationshipDiscoveryRules: [
            {
              id: "dynamic-texture-discovery",
              follow: [
                "dynamic texture owner",
                "upload cadence",
                "reload cleanup",
                "bounded cache"
              ]
            },
            {
              id: "ui-texture-metadata-discovery",
              classifyCandidatesAs: ["nine_slice_candidate"]
            }
          ]
        })
      }
    }
  };
}

function createDocsSqliteArtifact(
  artifactPath: string,
  entry: {
    entryId: string;
    packageId: string;
    kind: string;
    title: string;
    path: string;
    headings: string[];
    summary: string;
    searchTerms: string[];
    scriptScopes: string[];
    addonNames: string[];
    eventNames: string[];
    codeSymbols: string[];
  },
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
        code_symbols TEXT NOT NULL
      );
    `);
    database
      .prepare(
        `INSERT INTO docs_entries (
          entry_id, package_id, kind, title, path, headings, summary,
          search_terms, script_scopes, addon_names, event_names, code_symbols
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.entryId,
        entry.packageId,
        entry.kind,
        entry.title,
        entry.path,
        JSON.stringify(entry.headings),
        entry.summary,
        JSON.stringify(entry.searchTerms),
        JSON.stringify(entry.scriptScopes),
        JSON.stringify(entry.addonNames),
        JSON.stringify(entry.eventNames),
        JSON.stringify(entry.codeSymbols)
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
          entry.entryId,
          entry.title,
          entry.path,
          entry.summary,
          JSON.stringify(entry.searchTerms),
          JSON.stringify(entry.scriptScopes),
          JSON.stringify(entry.addonNames),
          JSON.stringify(entry.eventNames),
          JSON.stringify(entry.codeSymbols)
        );
    }
  } finally {
    database.close();
  }
}

function sqliteEntry() {
  return {
    entryId: "kubejs-server-recipes",
    packageId: "core-docs-required",
    kind: "event-catalog",
    title: "KubeJS Server Recipes",
    path: "docs/kubejs/server-events.md#recipes",
    headings: ["ServerEvents", "Recipes"],
    summary: "Use ServerEvents.recipes in server_scripts for recipe edits.",
    searchTerms: ["recipes", "server_scripts", "ServerEvents.recipes"],
    scriptScopes: ["server_scripts"],
    addonNames: ["kubejs"],
    eventNames: ["ServerEvents.recipes"],
    codeSymbols: ["ServerEvents.recipes"]
  };
}
