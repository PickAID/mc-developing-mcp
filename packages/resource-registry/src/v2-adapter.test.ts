import { describe, expect, it } from "vitest";

import { toPackageManifestV2 } from "./v2-adapter.js";
import type { MdmResourcePackageSummary } from "./manifest.js";

describe("resource registry v2 adapter", () => {
  it("converts v1 JSON docs resources into v2 docs bundles", () => {
    const manifest = toPackageManifestV2(summaryFixture());

    expect(manifest).toMatchObject({
      identity: {
        schemaVersion: 2,
        packageId: "core-docs-required",
        packageVersion: "0.1.0",
        namespace: "core"
      },
      artifact: {
        kind: "docs_bundle",
        format: "json",
        schemaId: "mdm.docs.json",
        entrypoint: "core-docs-required-0.1.0.mdm-resource.json"
      },
      capabilities: ["docs_search", "docs_direct_read"],
      policy: {
        privacy: "public_release",
        lifecycle: ["downloadable", "pinned"],
        canCommitToRepository: true,
        canUploadToPublicRelease: true
      },
      query: {
        adapter: "json_docs",
        capabilities: ["docs_search", "docs_direct_read"]
      },
      release: {
        channel: "required",
        family: "core"
      }
    });
  });

  it("converts v1 SQLite docs resources into v2 SQLite docs bundles", () => {
    const manifest = toPackageManifestV2(
      summaryFixture({
        id: "minecraft-docs-sqlite",
        required: false,
        format: "sqlite",
        metadata: {
          storageKind: "sqlite_bundle",
          installTier: "optional_dataset",
          commitPolicy: "repository_manifest"
        }
      })
    );

    expect(manifest.artifact).toMatchObject({
      kind: "docs_bundle",
      format: "sqlite",
      schemaId: "mdm.docs.sqlite"
    });
    expect(manifest.query.adapter).toBe("sqlite_docs");
    expect(manifest.release?.channel).toBe("docs");
  });

  it("converts optional accelerators into accelerator release channel packages", () => {
    const manifest = toPackageManifestV2(
      summaryFixture({
        id: "docs-embedding-accelerator",
        required: false,
        format: "sqlite",
        metadata: {
          storageKind: "optional_accelerator",
          installTier: "optional_accelerator",
          commitPolicy: "repository_manifest"
        }
      })
    );

    expect(manifest.policy.privacy).toBe("public_release");
    expect(manifest.policy.lifecycle).toEqual(["downloadable", "refreshable"]);
    expect(manifest.release?.channel).toBe("accelerators");
  });

  it("preserves v2 datapack release metadata from release manifests", () => {
    const manifest = toPackageManifestV2(
      summaryFixture({
        id: "minecraft-1.20.1-vanilla-datapack-profile",
        required: false,
        releaseChannel: "datapack",
        releaseFamily: "vanilla-datapack",
        capabilities: ["resource_location_lookup", "datapack_trace"]
      })
    );

    expect(manifest).toMatchObject({
      identity: {
        packageVersion: "0.1.0"
      },
      artifact: {
        kind: "datapack_bundle",
        schemaId: "mdm.datapack.json"
      },
      capabilities: ["resource_location_lookup", "datapack_trace"],
      query: {
        adapter: "archive_content",
        capabilities: ["resource_location_lookup", "datapack_trace"]
      },
      release: {
        channel: "datapack",
        family: "vanilla-datapack"
      }
    });
  });

  it("maps v2 mapping release packages to mapping bundle contracts", () => {
    const manifest = toPackageManifestV2(
      summaryFixture({
        id: "minecraft-1.20.1-yarn-mapping-profile",
        required: false,
        releaseChannel: "mappings",
        releaseFamily: "vanilla-mappings",
        capabilities: ["mapping_lookup", "mapping_explain"]
      })
    );

    expect(manifest).toMatchObject({
      artifact: {
        kind: "mapping_bundle",
        schemaId: "mdm.mapping.json"
      },
      query: {
        adapter: "mapping_index",
        capabilities: ["mapping_lookup", "mapping_explain"]
      },
      release: {
        channel: "mappings",
        family: "vanilla-mappings"
      }
    });
  });

  it("maps source index sqlite packages without treating them as docs sqlite", () => {
    const manifest = toPackageManifestV2(
      summaryFixture({
        id: "minecraft-1.20.1-source-index",
        required: false,
        format: "sqlite",
        artifactType: "source_index",
        artifactKind: "source_index",
        queryAdapter: "source_index_sqlite",
        releaseChannel: "sources",
        releaseFamily: "vanilla-source-index",
        capabilities: ["source_lookup", "source_chunk_search", "java_symbol_lookup"],
        metadata: {
          storageKind: "sqlite_bundle",
          installTier: "runtime_or_optional_dataset",
          commitPolicy: "repository_manifest"
        },
        detail: {
          ...summaryFixture().detail,
          artifactType: "source_index",
          artifactKind: "source_index",
          queryAdapter: "source_index_sqlite"
        }
      })
    );

    expect(manifest).toMatchObject({
      target: {
        mappings: ["official", "mojmap"]
      },
      artifact: {
        kind: "source_index",
        format: "sqlite",
        schemaId: "mdm.source.index.sqlite"
      },
      query: {
        adapter: "source_index_sqlite",
        capabilities: ["source_lookup", "source_chunk_search", "java_symbol_lookup"]
      },
      release: {
        channel: "sources",
        family: "vanilla-source-index"
      }
    });
  });

  it("converts generated local caches into private evictable packages", () => {
    const manifest = toPackageManifestV2(
      summaryFixture({
        id: "probejs-local-cache",
        required: false,
        format: "sqlite",
        currentRelease: null,
        detail: {
          schemaVersion: 1,
          id: "probejs-local-cache",
          sourcePath: "generated:probejs/global.d.ts",
          currentRelease: null,
          metadata: {
            storageKind: "generated_local_cache",
            installTier: "private_local_cache",
            commitPolicy: "private_generated_cache"
          }
        },
        metadata: {
          storageKind: "generated_local_cache",
          installTier: "private_local_cache",
          commitPolicy: "private_generated_cache"
        }
      })
    );

    expect(manifest.policy).toMatchObject({
      privacy: "user_private",
      lifecycle: ["generated_on_demand", "evictable"],
      canCommitToRepository: false,
      canUploadToPublicRelease: false,
      requiresUserConsent: true
    });
    expect(manifest.artifact.provenance).toEqual({
      sourceKind: "generated_local",
      source: "generated:probejs/global.d.ts"
    });
    expect(manifest.release).toBeUndefined();
  });

  it("rejects unsupported v1 resource formats instead of guessing json", () => {
    expect(() =>
      toPackageManifestV2(
        summaryFixture({
          format: "binary"
        })
      )
    ).toThrow("Unsupported mdm v1 resource format: binary");
  });

  it("rejects public packages when release version cannot be inferred", () => {
    expect(() =>
      toPackageManifestV2(
        summaryFixture({
          currentRelease: {
            artifactName: "core-docs-required.mdm-resource.json",
            sha256: "sha256:test",
            sizeBytes: 1201
          }
        })
      )
    ).toThrow("Cannot infer public mdm package version");
  });
});

function summaryFixture(
  overrides: Partial<MdmResourcePackageSummary> = {}
): MdmResourcePackageSummary {
  const id = overrides.id ?? "core-docs-required";
  const currentRelease = overrides.currentRelease ?? {
    artifactName: `${id}-0.1.0.mdm-resource.json`,
    sha256: "sha256:test",
    sizeBytes: 1201
  };

  return {
    id,
    manifestPath: "registry/packages/core-docs-required.json",
    required: true,
    format: "json",
    currentRelease,
    detail: {
      schemaVersion: 1,
      id,
      sourcePath: "packages/core/docs/required/package.json",
      currentRelease,
      metadata: overrides.metadata
    },
    metadata: {
      storageKind: "remote_manifest",
      installTier: "required_docs",
      commitPolicy: "repository_manifest"
    },
    ...overrides
  };
}
