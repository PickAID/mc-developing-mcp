import { describe, expect, it } from "vitest";

import { resolveMdmResourcePackageMetadata } from "./package-metadata.js";

describe("resolveMdmResourcePackageMetadata", () => {
  it("classifies SQLite bundles as repository package manifests", () => {
    const metadata = resolveMdmResourcePackageMetadata(
      {
        sqlite: {
          databaseName: "minecraft_docs.sqlite",
          minUserVersion: 3,
          requiredTables: ["documents", "documents_fts"]
        }
      },
      {
        packageId: "docs-sqlite-bundle",
        required: false,
        format: "sqlite",
        artifactType: "sqlite"
      }
    );

    expect(metadata).toEqual({
      storageKind: "sqlite_bundle",
      installTier: "optional_dataset",
      commitPolicy: "repository_manifest",
      sqlite: {
        databaseName: "minecraft_docs.sqlite",
        minUserVersion: 3,
        requiredTables: ["documents", "documents_fts"]
      }
    });
  });

  it("classifies generated caches as private local cache artifacts", () => {
    const metadata = resolveMdmResourcePackageMetadata(undefined, {
      packageId: "probejs-local-cache",
      required: false,
      format: "sqlite",
      sourcePath: "generated:probejs/global.d.ts"
    });

    expect(metadata).toEqual({
      storageKind: "generated_local_cache",
      installTier: "private_local_cache",
      commitPolicy: "private_generated_cache",
      sqlite: undefined
    });
  });

  it("preserves explicit generated cache metadata as private runtime-only data", () => {
    const metadata = resolveMdmResourcePackageMetadata(
      {
        storageKind: "generated_local_cache"
      },
      {
        packageId: "mod/create/source-index",
        required: false,
        format: "sqlite",
        sourcePath: "generated:modpack-cache"
      }
    );

    expect(metadata).toMatchObject({
      storageKind: "generated_local_cache",
      installTier: "private_local_cache",
      commitPolicy: "private_generated_cache"
    });
  });

  it("classifies optional accelerators separately from required docs", () => {
    const metadata = resolveMdmResourcePackageMetadata(undefined, {
      packageId: "minecraft-source-accelerator",
      required: false,
      format: "json",
      artifactType: "docs",
      variant: "optional-accelerator"
    });

    expect(metadata).toEqual({
      storageKind: "optional_accelerator",
      installTier: "optional_accelerator",
      commitPolicy: "repository_manifest",
      sqlite: undefined
    });
  });
});
