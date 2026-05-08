import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { registerMcpServerTools, type McpToolHandler } from "../tools/mcp-tools.js";

const require = createRequire(import.meta.url);

describe("mc_develop sqlite mdm docs resources", () => {
  it("installs sqlite docs resources and uses them during docs lookup", async () => {
    const registry = createCapturingRegistry();
    const release = await createSqliteDocsReleaseOut();
    const mdmSourcesRoot = await createSqliteDocsMdmSourcesRoot(release);
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    const workspaceRoot = await createWorkspaceRoot();

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "Find sqlite index role docs for offline MDM package queries.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestPath: release.manifestPath,
        packageId: "core-docs-search-sqlite",
        downloadPolicy: "allowed"
      }
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmReleaseInstall: {
        status: "downloaded",
        packageId: "core-docs-search-sqlite"
      },
      mdmResources: {
        summary: {
          counts: {
            ready: 1
          }
        }
      },
      selectedEvidence: {
        routeStep: "docs_lookup",
        payload: {
          hits: expect.arrayContaining([
            expect.objectContaining({
              entryId: "mdm.sqlite-index-role",
              packageId: "core-docs-search-sqlite",
              source: "sqlite"
            })
          ]),
          trace: expect.objectContaining({
            sqliteArtifactPackageIds: ["core-docs-search-sqlite"],
            sqliteMatchedEntryIds: expect.arrayContaining([
              "mdm.sqlite-index-role"
            ])
          })
        }
      }
    });
  });
});

async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-workspace-"));

  await mkdir(join(root, "kubejs", "server_scripts"), { recursive: true });
  await writeFile(join(root, "kubejs", "server_scripts", "main.js"), "\n");

  return root;
}

async function createSqliteDocsReleaseOut(): Promise<MdmTestReleaseOut> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sqlite-release-out-"));
  const artifactName = "core-docs-search-sqlite-0.1.0.sqlite";
  const artifactPath = join(root, artifactName);
  const manifestPath = join(root, "mdm-release-manifest.json");

  writeSqliteDocsArtifact(artifactPath);
  const body = await readFile(artifactPath);
  const sha256 = hashBytes(body);

  await writeJson(manifestPath, {
    schemaVersion: 1,
    generatedAt: "2026-05-06T00:00:00.000Z",
    packages: [
      {
        packageId: "core-docs-search-sqlite",
        version: "0.1.0",
        namespace: "core",
        artifactType: "docs",
        variant: "docs",
        required: false,
        format: "sqlite",
        artifactName,
        sha256,
        sizeBytes: body.byteLength,
        metadata: sqliteMetadata(),
        releaseChannel: "docs",
        releaseFamily: "core-docs",
        capabilities: ["docs_search", "docs_direct_read"]
      }
    ]
  });

  return {
    manifestPath,
    artifactName,
    sha256,
    sizeBytes: body.byteLength
  };
}

async function createSqliteDocsMdmSourcesRoot(
  release: MdmTestReleaseOut
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-sqlite-sources-"));

  await mkdir(join(root, "registry", "packages"), { recursive: true });
  await writeJson(join(root, "registry", "index.json"), {
    schemaVersion: 1,
    packages: [
      {
        id: "core-docs-search-sqlite",
        manifestPath: "registry/packages/core-docs-search-sqlite.json",
        required: false,
        format: "sqlite"
      }
    ]
  });
  await writeJson(
    join(root, "registry", "packages", "core-docs-search-sqlite.json"),
    {
      schemaVersion: 1,
      id: "core-docs-search-sqlite",
      sourcePath: "packages/docs/search/core-sqlite/package.json",
      metadata: sqliteMetadata(),
      currentRelease: {
        artifactName: release.artifactName,
        sha256: release.sha256,
        sizeBytes: release.sizeBytes
      }
    }
  );

  return root;
}

function writeSqliteDocsArtifact(path: string): void {
  const { DatabaseSync } = require("node:sqlite") as SqliteModule;
  const database = new DatabaseSync(path);
  try {
    database.exec([
      "CREATE TABLE docs_entries (",
      "entry_id TEXT PRIMARY KEY, package_id TEXT NOT NULL, kind TEXT NOT NULL,",
      "title TEXT NOT NULL, path TEXT NOT NULL, headings TEXT NOT NULL,",
      "summary TEXT NOT NULL, search_terms TEXT NOT NULL,",
      "script_scopes TEXT NOT NULL, addon_names TEXT NOT NULL,",
      "event_names TEXT NOT NULL, code_symbols TEXT NOT NULL",
      ")",
      ";",
      "CREATE VIRTUAL TABLE docs_entries_fts USING fts5(",
      "entry_id UNINDEXED, title, path, summary, search_terms,",
      "script_scopes, addon_names, event_names, code_symbols",
      ")"
    ].join(" "));
    insertDocsEntry(database);
    insertFtsEntry(database);
  } finally {
    database.close();
  }
}

function insertDocsEntry(database: SqliteDatabase): void {
  database.prepare([
    "INSERT INTO docs_entries",
    "(entry_id, package_id, kind, title, path, headings, summary, search_terms,",
    "script_scopes, addon_names, event_names, code_symbols)",
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ].join(" ")).run(
    "mdm.sqlite-index-role",
    "core-docs-search-sqlite",
    "concept",
    "SQLite index package role",
    "packages/docs/search/core-sqlite/payload/docs-search.json#mdm.sqlite-index-role",
    JSON.stringify(["Queryable database artifacts"]),
    "SQLite packages are compact offline indexes for MDM package queries.",
    JSON.stringify(["sqlite", "index", "offline", "query"]),
    JSON.stringify([]),
    JSON.stringify([]),
    JSON.stringify([]),
    JSON.stringify(["sqlite_docs", "docs_entries"])
  );
}

function insertFtsEntry(database: SqliteDatabase): void {
  database.prepare([
    "INSERT INTO docs_entries_fts",
    "(entry_id, title, path, summary, search_terms, script_scopes,",
    "addon_names, event_names, code_symbols)",
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ].join(" ")).run(
    "mdm.sqlite-index-role",
    "SQLite index package role",
    "packages/docs/search/core-sqlite/payload/docs-search.json#mdm.sqlite-index-role",
    "SQLite packages are compact offline indexes for MDM package queries.",
    "sqlite index offline query",
    "",
    "",
    "",
    "sqlite_docs docs_entries"
  );
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sqliteMetadata(): Record<string, unknown> {
  return {
    storageKind: "sqlite_bundle",
    sqlite: {
      requiredTables: ["docs_entries", "docs_entries_fts"]
    }
  };
}

function hashBytes(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

function createCapturingRegistry(): CapturingRegistry {
  const calls: RegisteredToolCall[] = [];

  return {
    calls,
    registerTool(name, _config, handler) {
      calls.push({ name, handler });
    }
  };
}

interface MdmTestReleaseOut {
  manifestPath: string;
  artifactName: string;
  sha256: string;
  sizeBytes: number;
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}

interface SqliteModule {
  DatabaseSync: new (databasePath: string) => SqliteDatabase;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): { run(...values: unknown[]): void };
  close(): void;
}
