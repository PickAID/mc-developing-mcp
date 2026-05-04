import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readLocalMdmResourceRegistry } from "./local-registry.js";

describe("readLocalMdmResourceRegistry", () => {
  it("loads package summaries and detail records from a local mdm-sources registry", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-registry-"));
    await mkdir(join(root, "registry", "packages"), { recursive: true });
    await writeJson(join(root, "registry", "index.json"), {
      schemaVersion: 1,
      packages: [
        {
          id: "core-docs-required",
          manifestPath: "registry/packages/core-docs-required.json",
          required: true,
          format: "json",
          currentRelease: {
            artifactName: "core-docs-required-0.1.0.mdm-resource.json",
            sha256:
              "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
            sizeBytes: 1201
          },
          metadata: {
            storageKind: "sqlite_bundle",
            sqlite: {
              databaseName: "minecraft_docs.sqlite",
              requiredTables: ["documents"]
            }
          }
        }
      ]
    });
    await writeJson(join(root, "registry", "packages", "core-docs-required.json"), {
      schemaVersion: 1,
      id: "core-docs-required",
      sourcePath: "packages/core/docs/required/package.json",
      currentRelease: {
        artifactName: "core-docs-required-0.1.0.mdm-resource.json",
        sha256:
          "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
        sizeBytes: 1201
      }
    });

    const registry = await readLocalMdmResourceRegistry(root);

    expect(registry).toMatchObject({
      root,
      schemaVersion: 1,
      packages: [
        {
          id: "core-docs-required",
          required: true,
          format: "json",
          detail: {
            id: "core-docs-required",
            sourcePath: "packages/core/docs/required/package.json",
            metadata: {
              storageKind: "sqlite_bundle",
              installTier: "required_docs",
              commitPolicy: "repository_manifest",
              sqlite: {
                databaseName: "minecraft_docs.sqlite",
                requiredTables: ["documents"]
              }
            }
          },
          metadata: {
            storageKind: "sqlite_bundle",
            installTier: "required_docs",
            commitPolicy: "repository_manifest",
            sqlite: {
              databaseName: "minecraft_docs.sqlite",
              requiredTables: ["documents"]
            }
          }
        }
      ]
    });
  });

  it("rejects registry detail paths that escape the registry root", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-registry-"));
    await mkdir(join(root, "registry"), { recursive: true });
    await writeJson(join(root, "registry", "index.json"), {
      schemaVersion: 1,
      packages: [
        {
          id: "bad",
          manifestPath: "../bad.json",
          required: false,
          format: "json"
        }
      ]
    });

    await expect(readLocalMdmResourceRegistry(root)).rejects.toThrow(
      "escapes mdm registry root"
    );
  });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
