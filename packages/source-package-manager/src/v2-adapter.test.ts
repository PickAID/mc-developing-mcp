import { describe, expect, it } from "vitest";

import { toInstalledSourcePackageManifestV2, toSourcePackageManifestsV2 } from "./v2-adapter.js";
import type { SourcePackageRecipe } from "./contracts.js";
import type { SourcePackageManifest } from "minecraft-developing-mcp-shared-types";

describe("source package v2 adapter", () => {
  it("converts source-pack recipes into source tree and source index packages", () => {
    const manifests = toSourcePackageManifestsV2({
      ...coordinate("source-pack", "named"),
      provenance: "materialized-local-copy",
      steps: [
        { kind: "copy_tree", sourceRoot: "/tmp/minecraft-sources" },
        { kind: "build_source_index", databaseFileName: "source-index.sqlite" },
        { kind: "write_package_manifest" }
      ]
    });

    expect(manifests).toMatchObject([
      {
        artifact: {
          kind: "source_tree",
          format: "directory",
          provenance: {
            sourceKind: "workspace",
            source: "/tmp/minecraft-sources"
          }
        },
        target: {
          mappings: ["named"]
        },
        capabilities: ["source_lookup", "source_chunk_search"],
        query: {
          adapter: "source_tree"
        },
        policy: {
          privacy: "local_generated",
          canCommitToRepository: false,
          canUploadToPublicRelease: false
        }
      },
      {
        artifact: {
          kind: "source_index",
          format: "sqlite",
          schemaId: "mdm.source.index.sqlite",
          entrypoint: "source-index.sqlite",
          provenance: {
            sourceKind: "generated_local",
            source: "recipe:minecraft-1.20.1-source-pack-named:build_source_index"
          }
        },
        policy: {
          privacy: "local_generated",
          canCommitToRepository: false,
          canUploadToPublicRelease: false
        },
        target: {
          mappings: ["named"]
        },
        dependencies: [
          {
            packageId: "minecraft-1.20.1-source-pack-named",
            versionRange: "0.0.0",
            reason: "Source index is generated from the installed source tree."
          }
        ]
      }
    ]);
  });

  it("converts datapack and resourcepack recipes into traceable bundles", () => {
    const datapack = toSourcePackageManifestsV2({
      ...coordinate("datapack", "official"),
      packageId: "minecraft-26.1.2-vanilla-datapack-official",
      provenance: "mojang-official-archive",
      steps: [
        {
          kind: "extract_archive_content",
          sourceArchive: "/tmp/server.jar",
          domains: ["data"]
        },
        { kind: "write_package_manifest" }
      ]
    })[0];
    const resourcepack = toSourcePackageManifestsV2({
      ...coordinate("resource-pack", "official"),
      packageId: "minecraft-26.1.2-vanilla-resource-pack-official",
      provenance: "mojang-official-archive",
      steps: [
        {
          kind: "extract_archive_content",
          sourceArchive: "/tmp/client.jar",
          domains: ["assets"]
        },
        { kind: "write_package_manifest" }
      ]
    })[0];

    expect(datapack).toMatchObject({
      artifact: {
        kind: "datapack_bundle",
        provenance: { sourceKind: "external_archive", source: "/tmp/server.jar" }
      },
      capabilities: ["resource_location_lookup", "datapack_trace"],
      query: { adapter: "archive_content" },
      target: { mappings: ["official"] },
      policy: { privacy: "local_generated" }
    });
    expect(resourcepack).toMatchObject({
      artifact: {
        kind: "resourcepack_bundle",
        provenance: { sourceKind: "external_archive", source: "/tmp/client.jar" }
      },
      capabilities: ["resource_location_lookup", "resourcepack_trace"],
      query: { adapter: "archive_content" },
      target: { mappings: ["official"] },
      policy: { privacy: "local_generated" }
    });
  });

  it("converts archive index recipes into mod archive index packages", () => {
    const manifest = toSourcePackageManifestsV2({
      ...coordinate("mod-archive-index", "official"),
      packageId: "lost-civilization-mod-archive-index",
      namespace: "mod/lost-civilization",
      provenance: "modpack-mods-folder",
      steps: [
        {
          kind: "extract_archive_content",
          sourceArchive: "/tmp/mods/create.jar",
          domains: ["data", "assets", "metadata"]
        },
        { kind: "write_package_manifest" }
      ]
    })[0];

    expect(manifest).toMatchObject({
      artifact: {
        kind: "mod_archive_index",
        format: "sqlite",
        entrypoint: "mod-archive-index.sqlite"
      },
      capabilities: [
        "mod_archive_owner_lookup",
        "resource_location_lookup",
        "datapack_trace",
        "resourcepack_trace"
      ],
      query: { adapter: "archive_content" },
      target: { mappings: ["official"] }
    });
  });

  it("converts mapping bundle recipes into mapping index packages", () => {
    const manifest = toSourcePackageManifestsV2({
      ...coordinate("mapping-bundle", "intermediary"),
      packageId: "minecraft-1.20.1-yarn-mappings",
      provenance: "yarn",
      steps: [
        {
          kind: "extract_remote_archive_content",
          sourceUrl: "https://example.test/yarn.zip",
          downloadFileName: "yarn.zip",
          domains: ["metadata"]
        },
        { kind: "write_package_manifest" }
      ]
    })[0];

    expect(manifest).toMatchObject({
      artifact: {
        kind: "mapping_bundle",
        format: "directory",
        provenance: {
          sourceKind: "public_release",
          source: "https://example.test/yarn.zip"
        }
      },
      capabilities: ["mapping_lookup", "mapping_explain"],
      query: {
        adapter: "mapping_index",
        capabilities: ["mapping_lookup", "mapping_explain"]
      },
      target: { mappings: ["intermediary"] },
      policy: { privacy: "local_generated" }
    });
  });

  it("uses a SQLite entrypoint for installed source index manifests", () => {
    const manifest = toInstalledSourcePackageManifestV2({
      ...coordinate("source-index", "named"),
      packageId: "minecraft-1.20.1-source-index-named",
      provenance: "installed-index",
      installedAt: "2026-05-06T00:00:00.000Z",
      stepKinds: ["build_source_index", "write_package_manifest"]
    });

    expect(manifest).toMatchObject({
      artifact: {
        kind: "source_index",
        format: "sqlite",
        schemaId: "mdm.source.index.sqlite",
        entrypoint: "source-index.sqlite"
      },
      query: { adapter: "source_index_sqlite" },
      target: { mappings: ["named"] }
    });
  });

  it("converts ProbeJS installed manifests into private snapshots", () => {
    const manifest = toInstalledSourcePackageManifestV2({
      ...coordinate("probejs-snapshot", "named"),
      packageId: "lost-civilization-probejs-snapshot",
      namespace: "kubejs",
      provenance: "PrismLauncher/LostCivilization/kubejs",
      installedAt: "2026-05-06T00:00:00.000Z",
      stepKinds: ["write_package_manifest"],
      capabilities: ["kubejs_symbol_lookup"]
    });

    expect(manifest).toMatchObject({
      artifact: {
        kind: "probejs_snapshot",
        provenance: {
          sourceKind: "generated_local",
          source: "manifest:lost-civilization-probejs-snapshot:PrismLauncher/LostCivilization/kubejs"
        }
      },
      policy: {
        privacy: "user_private",
        canCommitToRepository: false,
        canUploadToPublicRelease: false
      },
      target: {
        loaders: ["kubejs"],
        kubeJsScopes: ["probejs"]
      }
    });
  });
});

function coordinate(
  artifactType: SourcePackageRecipe["artifactType"],
  variant: SourcePackageRecipe["variant"]
): Omit<SourcePackageManifest, "provenance" | "installedAt" | "stepKinds"> {
  return {
    packageId: `minecraft-1.20.1-${artifactType}-${variant}`,
    namespace: "minecraft",
    minecraftVersion: "1.20.1",
    artifactType,
    variant
  };
}
