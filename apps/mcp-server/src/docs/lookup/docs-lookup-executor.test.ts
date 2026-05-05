import { fileURLToPath } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerDocsSelection } from "../selection/docs-selection.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { executeMcpServerDocsLookup } from "./docs-lookup-executor.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";

const require = createRequire(import.meta.url);

describe("executeMcpServerDocsLookup", () => {
  it("returns structured docs hits for a KubeJS docs lookup request", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "How should I place this startup_scripts recipe and use ProbeJS in 1.20.1?"
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[1];
    const docsSelection = buildMcpServerDocsSelection(requestPlan, candidate);

    const result = executeMcpServerDocsLookup({
      candidate,
      evidencePlan,
      requestPlan,
      docsSelection
    });

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "docs_lookup",
        selectedPackageIds: ["crychicdoc-kubejs-1.20.1-course-zh-cn"],
        hits: expect.arrayContaining([
          expect.objectContaining({
            entryId: "crychicdoc-kubejs-1.20.1-file-structure"
          }),
          expect.objectContaining({
            entryId: "crychicdoc-kubejs-1.20.1-probejs-workflow"
          })
        ])
      }
    });
  });

  it("returns an unmatched result when no docs packages were selected", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_external_crash")
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "The server crashes on startup and latest.log shows an exception in a mod."
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[2];
    const docsSelection = buildMcpServerDocsSelection(requestPlan, candidate);

    const result = executeMcpServerDocsLookup({
      candidate,
      evidencePlan,
      requestPlan,
      docsSelection
    });

    expect(result).toEqual({
      matched: false,
      summary: "No docs packages were selected for docs lookup.",
      payload: {
        source: "docs_lookup",
        queryText:
          "The server crashes on startup and latest.log shows an exception in a mod.",
        selectedPackageIds: [],
        hits: []
      }
    });
  });

  it("queries sqlite docs artifacts directly without requiring loaded resource records", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-docs-lookup-sqlite-"));
    const sqlitePath = join(root, "docs.sqlite");
    createDocsSqliteArtifact(sqlitePath);
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "How do I use ServerEvents.recipes in server_scripts?"
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[1];
    const docsSelection = buildMcpServerDocsSelection(requestPlan, candidate);

    const result = executeMcpServerDocsLookup(
      {
        candidate,
        evidencePlan,
        requestPlan,
        docsSelection
      },
      {
        resourceRecords: [],
        sqliteArtifacts: [
          {
            packageId: "docs-sqlite",
            artifactPath: sqlitePath
          }
        ]
      }
    );

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "docs_lookup",
        hits: expect.arrayContaining([
          expect.objectContaining({
            entryId: "kubejs-server-recipes",
            packageId: "docs-sqlite",
            matchReasons: expect.arrayContaining([
              expect.stringMatching(/^sqlite_/)
            ])
          })
        ]),
        trace: {
          sqliteArtifactPackageIds: ["docs-sqlite"],
          sqliteMatchedEntryIds: ["kubejs-server-recipes"]
        }
      }
    });
  });

  it("ranks mixed sqlite and JSON resource hits by stable score and traces candidates", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-docs-lookup-mixed-"));
    const sqlitePath = join(root, "docs.sqlite");
    createDocsSqliteArtifact(sqlitePath);
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot: resolveScenarioPath("modpack_kubejs")
      }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      "json resource recipes server_scripts kubejs ServerEvents.recipes"
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates[1];

    const result = executeMcpServerDocsLookup(
      {
        candidate,
        evidencePlan,
        requestPlan,
        docsSelection: emptyDocsSelection(candidate.routeStep)
      },
      {
        resourceRecords: [
          {
            entryId: "json-resource-recipes",
            packageId: "docs-json",
            kind: "event-catalog",
            title: "JSON Resource Recipes",
            path: "docs/json/recipes.md#recipes",
            headings: ["ServerEvents.recipes"],
            summary: "Use ServerEvents.recipes with KubeJS in server_scripts.",
            searchTerms: ["json", "resource", "recipes", "server_scripts", "kubejs"],
            scriptScopes: ["server_scripts"],
            addonNames: ["kubejs"],
            eventNames: ["ServerEvents.recipes"],
            codeSymbols: ["ServerEvents.recipes"]
          }
        ],
        sqliteArtifacts: [
          {
            packageId: "docs-sqlite",
            artifactPath: sqlitePath
          }
        ]
      }
    );

    expect(result).toMatchObject({
      matched: true,
      payload: {
        hits: [
          expect.objectContaining({
            entryId: "json-resource-recipes",
            source: "resource"
          }),
          expect.objectContaining({
            entryId: "kubejs-server-recipes",
            source: "sqlite"
          })
        ],
        trace: {
          sqliteCandidateEntryIds: ["kubejs-server-recipes"],
          sqliteMatchedEntryIds: ["kubejs-server-recipes"],
          recordMatchedEntryIds: ["json-resource-recipes"],
          matchedEntryIds: ["json-resource-recipes", "kubejs-server-recipes"],
          hitRanking: [
            expect.objectContaining({
              entryId: "json-resource-recipes",
              source: "resource"
            }),
            expect.objectContaining({
              entryId: "kubejs-server-recipes",
              source: "sqlite"
            })
          ]
        }
      }
    });
  });
});

function resolveScenarioPath(name: string): string {
  return fileURLToPath(
    new URL(`../../../../../testdata/scenarios/${name}`, import.meta.url)
  );
}

function createDocsSqliteArtifact(artifactPath: string): void {
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
        "kubejs-server-recipes",
        "docs-sqlite",
        "event-catalog",
        "KubeJS Server Recipes",
        "docs/kubejs/server-events.md#recipes",
        JSON.stringify(["ServerEvents", "Recipes"]),
        "Use ServerEvents.recipes in server_scripts for recipe edits.",
        JSON.stringify(["recipes", "server_scripts", "ServerEvents.recipes"]),
        JSON.stringify(["server_scripts"]),
        JSON.stringify(["kubejs"]),
        JSON.stringify(["ServerEvents.recipes"]),
        JSON.stringify(["ServerEvents.recipes"])
      );
  } finally {
    database.close();
  }
}

function emptyDocsSelection(routeStep: string) {
  return {
    selections: [],
    trace: {
      registryPackageIds: [],
      taskIntentId: "kubejs_authoring" as const,
      routeStep: routeStep as "docs_lookup",
      rejectedPackages: []
    }
  };
}
