import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findMdmReleasePackage,
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
          sha256:
            "613fe56a573fbe1eee45c930941b0de48e091ecf9111e38ec17ddfd15ecc5477"
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
      "mdm release package field version must be a non-empty string"
    );
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
          required: true,
          format: "json",
          currentRelease: {
            artifactName: "core-docs-required-0.1.0.mdm-resource.json"
          },
          detail: {
            sourcePath:
              "release:core-docs-required-0.1.0.mdm-resource.json"
          }
        }
      ]
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
        sizeBytes: 1201
      }
    ]
  };
}
