import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  resolveMdmResourceCacheLayout,
  writeCachedResourceState
} from "@mcpskill/resource-registry";

import { loadMdmDocsResourcesFromStatus } from "./mdm-docs-records.js";
import type { MdmResourceStatusContext } from "../mdm-resource/mdm-resource-status.js";

const require = createRequire(import.meta.url);

describe("loadMdmDocsResourcesFromStatus", () => {
  it("returns records and bounded failures for ready MDM docs artifacts", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-docs-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const validBody = docsArtifactBody("offline-resource-status");
    const invalidBody = "{ not json";
    const validPath = await writeArtifact(
      cacheLayout.artifactsDir,
      "core-docs-required",
      "valid.mdm-resource.json",
      validBody
    );
    const invalidPath = await writeArtifact(
      cacheLayout.artifactsDir,
      "broken-docs",
      "broken.mdm-resource.json",
      invalidBody
    );

    await writeCachedResourceState(cacheLayout, state("core-docs-required", validPath, validBody));
    await writeCachedResourceState(cacheLayout, state("broken-docs", invalidPath, invalidBody));

    const result = await loadMdmDocsResourcesFromStatus({
      status: "available",
      cacheRoot: cacheLayout.root,
      summary: {
        packages: [
          {
            packageId: "core-docs-required",
            required: true,
            status: "ready",
            artifactPath: validPath,
            message: "ready"
          },
          {
            packageId: "broken-docs",
            required: false,
            status: "ready",
            artifactPath: invalidPath,
            message: "ready"
          }
        ],
        counts: {
          missing_required: 0,
          missing_optional: 0,
          ready: 2,
          invalid_checksum: 0
        }
      },
      message: "loaded"
    } satisfies MdmResourceStatusContext);

    expect(result.records).toEqual([
      expect.objectContaining({
        entryId: "offline-resource-status",
        packageId: "core-docs-required"
      })
    ]);
    expect(result.summary).toMatchObject({
      status: "degraded",
      artifactCount: 2,
      recordCount: 1,
      failedArtifactCount: 1,
      errors: [
        expect.objectContaining({
          artifactPath: invalidPath,
          message: expect.stringContaining("Expected property name")
        })
      ]
    });
  });

  it("keeps sqlite docs artifacts for direct lookup while preserving JSON artifact compatibility", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-docs-"));
    const cacheLayout = resolveMdmResourceCacheLayout(runtimeRoot);
    const jsonBody = docsArtifactBody("offline-resource-status");
    const jsonPath = await writeArtifact(
      cacheLayout.artifactsDir,
      "core-docs-required",
      "valid.mdm-resource.json",
      jsonBody
    );
    const sqlitePath = join(
      cacheLayout.artifactsDir,
      "docs-sqlite",
      "docs-sqlite-0.1.0.sqlite"
    );

    await mkdir(join(cacheLayout.artifactsDir, "docs-sqlite"), {
      recursive: true
    });
    createDocsSqliteArtifact(sqlitePath);
    await writeCachedResourceState(cacheLayout, state("core-docs-required", jsonPath, jsonBody));
    await writeCachedResourceState(
      cacheLayout,
      state("docs-sqlite", sqlitePath, await readBinaryBody(sqlitePath))
    );

    const result = await loadMdmDocsResourcesFromStatus({
      status: "available",
      cacheRoot: cacheLayout.root,
      summary: {
        packages: [
          {
            packageId: "core-docs-required",
            required: true,
            status: "ready",
            artifactPath: jsonPath,
            message: "ready",
            metadata: {
              storageKind: "remote_manifest",
              installTier: "required_docs",
              commitPolicy: "repository_manifest"
            }
          },
          {
            packageId: "docs-sqlite",
            required: true,
            status: "ready",
            artifactPath: sqlitePath,
            message: "ready",
            metadata: {
              storageKind: "sqlite_bundle",
              installTier: "required_docs",
              commitPolicy: "repository_manifest",
              sqlite: {
                minUserVersion: 3,
                requiredTables: ["docs_entries"]
              }
            }
          }
        ],
        counts: {
          missing_required: 0,
          missing_optional: 0,
          ready: 2,
          invalid_checksum: 0
        }
      },
      message: "loaded"
    } satisfies MdmResourceStatusContext);

    expect(result.records).toEqual([
      expect.objectContaining({
        entryId: "offline-resource-status",
        packageId: "core-docs-required"
      })
    ]);
    expect(result.sqliteArtifacts).toEqual([
      {
        packageId: "docs-sqlite",
        artifactPath: sqlitePath
      }
    ]);
    expect(result.summary).toMatchObject({
      status: "available",
      artifactCount: 2,
      recordCount: 1,
      failedArtifactCount: 0,
      errors: []
    });
  });
});

async function writeArtifact(
  artifactsDir: string,
  packageId: string,
  artifactName: string,
  body: string
): Promise<string> {
  const artifactPath = join(artifactsDir, packageId, artifactName);

  await mkdir(join(artifactsDir, packageId), { recursive: true });
  await writeFile(artifactPath, body);

  return artifactPath;
}

function state(packageId: string, artifactPath: string, body: string | Buffer) {
  return {
    packageId,
    artifactName: artifactPath.split("/").at(-1) ?? "artifact.mdm-resource.json",
    artifactPath,
    sha256: createHash("sha256").update(body).digest("hex"),
    updatedAt: "2026-04-29T00:00:00.000Z"
  };
}

function docsArtifactBody(entryId: string): string {
  return JSON.stringify({
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
              id: entryId,
              title: "Offline Resource Status",
              summary:
                "Missing optional packages are degraded capability, not fatal failure."
            }
          ]
        })
      }
    }
  });
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

async function readBinaryBody(path: string): Promise<Buffer> {
  return readFile(path);
}
