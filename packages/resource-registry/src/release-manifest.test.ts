import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findMdmReleasePackage,
  readMdmReleaseManifest,
  readMdmReleaseManifestFile,
  resolveMdmReleaseArtifactUrl,
  fetchMdmReleaseManifest,
  toMdmResourceRegistryFromReleaseManifest
} from "./release-manifest.js";

describe("mdm release manifest", () => {
  it("reads release package metadata from a local manifest file", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-release-"));
    const manifestPath = join(root, "mdm-release-manifest.json");

    await writeFile(manifestPath, JSON.stringify(fixtureManifest(), null, 2));

    const manifest = await readMdmReleaseManifestFile(manifestPath);

    expect(manifest).toMatchObject({
      source: manifestPath,
      schemaVersion: 1,
      packages: [
        {
          packageId: "core-docs-required",
          artifactName: "core-docs-required-0.1.0.mdm-resource.json",
          metadata: {
            storageKind: "remote_manifest",
            installTier: "required_docs",
            commitPolicy: "repository_manifest"
          },
          sha256:
            "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
          releaseChannel: "required",
          releaseFamily: "core-docs",
          capabilities: ["docs_search", "docs_direct_read"]
        }
      ]
    });
    expect(findMdmReleasePackage(manifest, "core-docs-required")).toMatchObject({
      required: true,
      version: "0.1.0"
    });
  });

  it("fetches release manifests through an injected fetcher", async () => {
    const manifest = await fetchMdmReleaseManifest(
      "https://example.test/releases/download/mdm-resources-v0.1.0/mdm-release-manifest.json",
      async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(fixtureManifest())
      })
    );

    expect(manifest.source).toBe(
      "https://example.test/releases/download/mdm-resources-v0.1.0/mdm-release-manifest.json"
    );
    expect(resolveMdmReleaseArtifactUrl(manifest.source, manifest.packages[0])).toBe(
      "https://example.test/releases/download/mdm-resources-v0.1.0/core-docs-required-0.1.0.mdm-resource.json"
    );
  });

  it("accepts package bundleRef entries and bundle artifacts", () => {
    const manifest = readMdmReleaseManifest({
      ...fixtureManifest(),
      packages: [
        {
          ...fixtureManifest().packages[0],
          artifactName: undefined,
          bundleRef: {
            bundleName: "required.mdm-bundle",
            memberName: "core-docs-required-0.1.0.mdm-resource.json",
            sha256:
              "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
            sizeBytes: 1201
          }
        }
      ].map(removeUndefinedValues),
      bundles: [
        {
          bundleName: "required.mdm-bundle",
          releaseChannel: "required",
          artifactName: "required.mdm-bundle.json",
          packageCount: 1,
          sha256:
            "f13fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
          sizeBytes: 2048
        }
      ]
    });

    expect(manifest.packages[0]).toMatchObject({
      packageId: "core-docs-required",
      artifactName: "core-docs-required-0.1.0.mdm-resource.json",
      bundleRef: {
        bundleName: "required.mdm-bundle",
        memberName: "core-docs-required-0.1.0.mdm-resource.json"
      }
    });
    expect(manifest.bundles?.[0]).toMatchObject({
      bundleName: "required.mdm-bundle",
      artifactName: "required.mdm-bundle.json"
    });
    expect(toMdmResourceRegistryFromReleaseManifest(manifest).packages[0])
      .toMatchObject({
        currentRelease: {
          artifactName: "core-docs-required-0.1.0.mdm-resource.json"
        },
        detail: {
          sourcePath: "release:core-docs-required-0.1.0.mdm-resource.json"
        }
      });
  });

  it("rejects malformed release package entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-release-"));
    const manifestPath = join(root, "mdm-release-manifest.json");

    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: "2026-04-29T00:00:00.000Z",
        packages: [{ packageId: "missing-fields" }]
      })
    );

    await expect(readMdmReleaseManifestFile(manifestPath)).rejects.toThrow(
      "mdm release package field required must be a boolean"
    );
  });

  it.each([
    {
      name: "unsupported schema version",
      patch: { schemaVersion: 2 },
      error: /schemaVersion must be 1/
    },
    {
      name: "path-like artifact name",
      packagePatch: { artifactName: "nested/core-docs.json" },
      error: /artifactName must be a file name/
    },
    {
      name: "invalid sha256",
      packagePatch: { sha256: "not-a-sha" },
      error: /sha256 must be a lowercase sha256/
    },
    {
      name: "fractional size",
      packagePatch: { sizeBytes: 12.5 },
      error: /sizeBytes must be a non-negative integer/
    },
    {
      name: "missing release channel",
      deletePackageField: "releaseChannel",
      error: /releaseChannel is required/
    },
    {
      name: "missing release family",
      deletePackageField: "releaseFamily",
      error: /releaseFamily must be a non-empty string/
    },
    {
      name: "empty capability",
      packagePatch: { capabilities: ["docs_search", ""] },
      error: /capabilities must contain non-empty strings/
    }
  ])("rejects $name", ({ patch, packagePatch, deletePackageField, error }) => {
    const manifest = fixtureManifest();
    Object.assign(manifest, patch);
    Object.assign(manifest.packages[0], packagePatch);
    if (deletePackageField !== undefined) {
      delete manifest.packages[0][deletePackageField];
    }

    expect(() => readMdmReleaseManifest(manifest)).toThrow(error);
  });

  it("converts release manifests into resource registry summaries", () => {
    const registry = toMdmResourceRegistryFromReleaseManifest(
      readFixtureManifest()
    );

    expect(registry).toMatchObject({
      root: "https://example.test/releases/download/mdm-resources-v0.1.0/mdm-release-manifest.json",
      schemaVersion: 1,
      packages: [
        {
          id: "core-docs-required",
          packageVersion: "0.1.0",
          required: true,
          format: "json",
          metadata: {
            storageKind: "remote_manifest",
            installTier: "required_docs",
            commitPolicy: "repository_manifest"
          },
          releaseChannel: "required",
          releaseFamily: "core-docs",
          capabilities: ["docs_search", "docs_direct_read"],
          currentRelease: {
            artifactName: "core-docs-required-0.1.0.mdm-resource.json"
          },
          detail: {
            packageVersion: "0.1.0",
            sourcePath:
              "release:core-docs-required-0.1.0.mdm-resource.json",
            metadata: {
              storageKind: "remote_manifest",
              installTier: "required_docs",
              commitPolicy: "repository_manifest"
            },
            releaseChannel: "required",
            releaseFamily: "core-docs",
            capabilities: ["docs_search", "docs_direct_read"]
          }
        }
      ]
    });
  });

  it("preserves source index release package routing fields", () => {
    const registry = toMdmResourceRegistryFromReleaseManifest({
      ...readFixtureManifest(),
      packages: [sourceIndexReleasePackage()]
    });

    expect(registry.packages[0]).toMatchObject({
      id: "minecraft-1.20.1-source-index",
      format: "sqlite",
      artifactType: "source_index",
      artifactKind: "source_index",
      queryAdapter: "source_index_sqlite",
      metadata: {
        storageKind: "sqlite_bundle",
        installTier: "runtime_or_optional_dataset",
        sqlite: {
          requiredTables: ["files", "java_symbols", "java_members"]
        }
      },
      detail: {
        artifactType: "source_index",
        artifactKind: "source_index",
        queryAdapter: "source_index_sqlite"
      }
    });
  });
});

function readFixtureManifest() {
  return {
    ...fixtureManifest(),
    source:
      "https://example.test/releases/download/mdm-resources-v0.1.0/mdm-release-manifest.json"
  };
}

function fixtureManifest() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-04-29T01:05:10.846Z",
    packages: [
      {
        packageId: "core-docs-required",
        version: "0.1.0",
        namespace: "core",
        artifactType: "docs",
        variant: "required",
        required: true,
        format: "json",
        artifactName: "core-docs-required-0.1.0.mdm-resource.json",
        sha256:
          "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
        sizeBytes: 1201,
        releaseChannel: "required",
        releaseFamily: "core-docs",
        capabilities: ["docs_search", "docs_direct_read"]
      }
    ]
  };
}

function sourceIndexReleasePackage() {
  return {
    packageId: "minecraft-1.20.1-source-index",
    version: "0.1.0",
    namespace: "minecraft",
    artifactType: "source_index",
    artifactKind: "source_index",
    queryAdapter: "source_index_sqlite",
    variant: "sources",
    required: false,
    format: "sqlite",
    artifactName: "minecraft-1.20.1-source-index-0.1.0.sqlite",
    sha256:
      "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477",
    sizeBytes: 4096,
    metadata: {
      storageKind: "sqlite_bundle",
      installTier: "runtime_or_optional_dataset",
      commitPolicy: "repository_manifest",
      sqlite: {
        requiredTables: ["files", "java_symbols", "java_members"]
      }
    },
    releaseChannel: "sources" as const,
    releaseFamily: "vanilla-source-index",
    capabilities: ["source_lookup", "source_chunk_search", "java_symbol_lookup"] as const
  };
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, nested]) => nested !== undefined)
  ) as T;
}
