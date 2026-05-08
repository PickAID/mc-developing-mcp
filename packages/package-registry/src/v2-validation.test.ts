import { describe, expect, it } from "vitest";

import { parsePackageManifestV2 } from "./v2-validation.js";

const publicSqliteDocsPackage = {
  identity: {
    schemaVersion: 2,
    packageId: "minecraft-1.21.1-docs-core",
    packageVersion: "0.1.0",
    namespace: "minecraft",
    displayName: "Minecraft 1.21.1 Core Docs",
    description: "Compact docs package"
  },
  target: {
    minecraftVersions: ["1.21.1"],
    loaders: ["vanilla"]
  },
  artifact: {
    kind: "docs_bundle",
    format: "sqlite",
    schemaId: "mdm.docs.sqlite",
    schemaVersion: 1,
    entrypoint: "docs.sqlite"
  },
  capabilities: ["docs_search", "docs_direct_read"],
  policy: {
    privacy: "public_release",
    lifecycle: ["downloadable", "pinned"],
    canCommitToRepository: true,
    canUploadToPublicRelease: true,
    requiresUserConsent: false
  },
  query: {
    adapter: "sqlite_docs",
    capabilities: ["docs_search"],
    defaultLimit: 8,
    maxLimit: 50,
    preferredFallbacks: ["json_docs"]
  },
  release: {
    channel: "docs",
    family: "minecraft-docs"
  }
} as const;

describe("parsePackageManifestV2", () => {
  it("accepts a public sqlite docs package", () => {
    expect(parsePackageManifestV2(publicSqliteDocsPackage)).toEqual(
      publicSqliteDocsPackage
    );
  });

  it("accepts public external library packages", () => {
    const externalLibraryPackage = {
      ...publicSqliteDocsPackage,
      identity: {
        ...publicSqliteDocsPackage.identity,
        packageId: "ftb-quests-archive-index",
        displayName: "FTB Quests Archive Index"
      },
      artifact: {
        kind: "mod_archive_index",
        format: "json",
        schemaId: "mdm.external-library.archive-index",
        schemaVersion: 1,
        entrypoint: "archive-index.json"
      },
      capabilities: ["mod_archive_owner_lookup"],
      query: {
        adapter: "archive_content",
        capabilities: ["mod_archive_owner_lookup"],
        defaultLimit: 8,
        maxLimit: 50,
        preferredFallbacks: []
      },
      release: {
        channel: "external-libraries",
        family: "public-mod-libraries"
      }
    } as const;

    expect(parsePackageManifestV2(externalLibraryPackage)).toEqual(
      externalLibraryPackage
    );
  });

  it("rejects private packages marked committable or uploadable", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        policy: {
          privacy: "user_private",
          lifecycle: ["generated_on_demand", "evictable"],
          canCommitToRepository: true,
          canUploadToPublicRelease: false,
          requiresUserConsent: true
        }
      })
    ).toThrow("private or generated packages cannot be committed or uploaded");
  });

  it("requires private or generated packages to declare provenance", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        policy: {
          privacy: "local_generated",
          lifecycle: ["generated_on_demand", "evictable"],
          canCommitToRepository: false,
          canUploadToPublicRelease: false,
          requiresUserConsent: true
        }
      })
    ).toThrow("private or generated packages must declare artifact.provenance");
  });

  it("requires public packages to declare release channel metadata", () => {
    const { release: _release, ...withoutRelease } = publicSqliteDocsPackage;

    expect(() => parsePackageManifestV2(withoutRelease)).toThrow(
      "public_release packages must declare release channel metadata"
    );
  });

  it("rejects query capabilities not declared by package", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        query: {
          ...publicSqliteDocsPackage.query,
          capabilities: ["docs_search", "source_lookup"]
        }
      })
    ).toThrow("query capability source_lookup is not declared by package");
  });

  it("rejects invalid query limits", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        query: {
          ...publicSqliteDocsPackage.query,
          defaultLimit: 100
        }
      })
    ).toThrow("query.defaultLimit must be less than or equal to query.maxLimit");
  });

  it("requires source packages to declare their mapping namespace", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        artifact: {
          kind: "source_tree",
          format: "directory",
          schemaId: "mdm.sources.tree",
          schemaVersion: 1,
          entrypoint: "src"
        },
        capabilities: ["source_lookup"],
        query: {
          adapter: "source_tree",
          capabilities: ["source_lookup"],
          defaultLimit: 8,
          maxLimit: 50,
          preferredFallbacks: []
        }
      })
    ).toThrow("source packages must declare target.mappings");
  });

  it("requires source indexes to declare their mapping namespace", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        artifact: {
          kind: "source_index",
          format: "sqlite",
          schemaId: "mdm.source.index.sqlite",
          schemaVersion: 1,
          entrypoint: "source-index.sqlite"
        },
        capabilities: ["source_lookup", "java_symbol_lookup"],
        query: {
          adapter: "source_index_sqlite",
          capabilities: ["java_symbol_lookup"],
          defaultLimit: 8,
          maxLimit: 50,
          preferredFallbacks: []
        }
      })
    ).toThrow("source packages must declare target.mappings");
  });

  it("requires source indexes to use the source index sqlite query contract", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        target: {
          mappings: ["official", "mojmap"]
        },
        artifact: {
          kind: "source_index",
          format: "sqlite",
          schemaId: "mdm.source.index.sqlite",
          schemaVersion: 1,
          entrypoint: "source-index.sqlite"
        },
        capabilities: ["source_lookup"],
        query: {
          adapter: "sqlite_docs",
          capabilities: ["source_lookup"],
          defaultLimit: 8,
          maxLimit: 50,
          preferredFallbacks: []
        }
      })
    ).toThrow("source_index packages must use source_index_sqlite query adapter");
  });

  it("requires source indexes to use the source index sqlite schema", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        target: {
          mappings: ["official", "mojmap"]
        },
        artifact: {
          kind: "source_index",
          format: "sqlite",
          schemaId: "mdm.docs.sqlite",
          schemaVersion: 1,
          entrypoint: "source-index.sqlite"
        },
        capabilities: ["source_lookup"],
        query: {
          adapter: "source_index_sqlite",
          capabilities: ["source_lookup"],
          defaultLimit: 8,
          maxLimit: 50,
          preferredFallbacks: []
        }
      })
    ).toThrow("source_index packages must use mdm.source.index.sqlite schema");
  });

  it("accepts mapping bundles for explaining unmapped and mapped symbols", () => {
    const parsed = parsePackageManifestV2({
      ...publicSqliteDocsPackage,
      identity: {
        ...publicSqliteDocsPackage.identity,
        packageId: "minecraft-1.21.1-yarn-mappings",
        displayName: "Minecraft 1.21.1 Yarn Mappings"
      },
      target: {
        minecraftVersions: ["1.21.1"],
        loaders: ["fabric"],
        mappings: ["official", "intermediary", "named", "yarn"]
      },
      artifact: {
        kind: "mapping_bundle",
        format: "sqlite",
        schemaId: "mdm.mappings.sqlite",
        schemaVersion: 1,
        entrypoint: "mappings.sqlite"
      },
      capabilities: ["mapping_lookup", "mapping_explain"],
      query: {
        adapter: "mapping_index",
        capabilities: ["mapping_lookup", "mapping_explain"],
        defaultLimit: 8,
        maxLimit: 50,
        preferredFallbacks: []
      }
    });

    expect(parsed.artifact.kind).toBe("mapping_bundle");
    expect(parsed.target.mappings).toContain("intermediary");
  });

  it("requires mapping bundles to expose mapping lookup through mapping index", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        artifact: {
          kind: "mapping_bundle",
          format: "sqlite",
          schemaId: "mdm.mappings.sqlite",
          schemaVersion: 1,
          entrypoint: "mappings.sqlite"
        },
        capabilities: ["mapping_lookup"],
        query: {
          adapter: "sqlite_docs",
          capabilities: ["mapping_lookup"],
          defaultLimit: 8,
          maxLimit: 50,
          preferredFallbacks: []
        }
      })
    ).toThrow("mapping_bundle packages must expose mapping_lookup via mapping_index");
  });

  it("requires embedding metadata and authoritative fallback", () => {
    expect(() =>
      parsePackageManifestV2({
        ...publicSqliteDocsPackage,
        artifact: {
          kind: "embedding_bundle",
          format: "sqlite",
          schemaId: "mdm.embeddings.sqlite",
          schemaVersion: 1,
          entrypoint: "embeddings.sqlite"
        },
        capabilities: ["embedding_recall"],
        query: {
          adapter: "embedding_index",
          capabilities: ["embedding_recall"],
          defaultLimit: 8,
          maxLimit: 50,
          preferredFallbacks: ["embedding_index"]
        },
        release: {
          channel: "accelerators",
          family: "minecraft-docs-embeddings"
        }
      })
    ).toThrow("embedding_bundle packages must declare artifact.embedding metadata");
  });

  it("accepts embedding bundles only as optional accelerators", () => {
    const parsed = parsePackageManifestV2({
      ...publicSqliteDocsPackage,
      artifact: {
        kind: "embedding_bundle",
        format: "sqlite",
        schemaId: "mdm.embeddings.sqlite",
        schemaVersion: 1,
        entrypoint: "embeddings.sqlite",
        embedding: {
          provider: "local",
          model: "test-embedding",
          vectorDimension: 128,
          chunkingAlgorithmVersion: "chunk-v1",
          sourcePackages: [
            {
              packageId: "minecraft-1.21.1-docs-core",
              contentHash: "sha256:test"
            }
          ],
          regenerationPolicy: "regenerate when source hash changes"
        }
      },
      capabilities: ["embedding_recall"],
      query: {
        adapter: "embedding_index",
        capabilities: ["embedding_recall"],
        defaultLimit: 8,
        maxLimit: 50,
        preferredFallbacks: ["sqlite_docs"]
      },
      release: {
        channel: "accelerators",
        family: "minecraft-docs-embeddings"
      }
    });

    expect(parsed.artifact.embedding?.vectorDimension).toBe(128);
  });
});
