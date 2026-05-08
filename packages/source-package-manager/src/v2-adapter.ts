import {
  parsePackageManifestV2,
  type ArtifactKindV2,
  type PackageCapabilityV2,
  type PackageManifestV2,
  type QueryAdapterV2
} from "minecraft-developing-mcp-package-registry";
import type { SourcePackageManifest } from "minecraft-developing-mcp-shared-types";

import type { SourcePackageRecipe } from "./contracts.js";
import {
  artifactFormatFor,
  artifactKindFor,
  capabilitiesFor,
  entrypointFor,
  loadersFor,
  mappingsFor,
  provenanceFromRecipe,
  queryAdapterFor,
  schemaIdFor
} from "./v2-adapter-classification.js";

export function toSourcePackageManifestsV2(
  recipe: SourcePackageRecipe
): PackageManifestV2[] {
  const primary = buildPackageManifest(recipe, {
    packageId: recipe.packageId,
    artifactKind: artifactKindFor(recipe.artifactType),
    entrypoint: entrypointFor(artifactKindFor(recipe.artifactType)),
    provenance: provenanceFromRecipe(recipe),
    capabilities: capabilitiesFor(recipe.artifactType),
    queryAdapter: queryAdapterFor(recipe.artifactType)
  });
  const indexStep = recipe.steps.find((step) => step.kind === "build_source_index");

  if (!indexStep) {
    return [primary];
  }

  return [
    primary,
    buildPackageManifest(recipe, {
      packageId: `${recipe.packageId}-source-index`,
      artifactKind: "source_index",
      entrypoint: indexStep.databaseFileName ?? "source-index.sqlite",
      provenance: {
        sourceKind: "generated_local",
        source: `recipe:${recipe.packageId}:build_source_index`
      },
      capabilities: ["source_lookup", "source_chunk_search", "java_symbol_lookup"],
      queryAdapter: "source_index_sqlite",
      dependencies: [
        {
          packageId: recipe.packageId,
          versionRange: "0.0.0",
          reason: "Source index is generated from the installed source tree."
        }
      ]
    })
  ];
}

export function toInstalledSourcePackageManifestV2(
  manifest: SourcePackageManifest
): PackageManifestV2 {
  return buildPackageManifest(manifest, {
    packageId: manifest.packageId,
    artifactKind: artifactKindFor(manifest.artifactType),
    entrypoint: entrypointFor(artifactKindFor(manifest.artifactType)),
    provenance: {
      sourceKind: "generated_local",
      source: `manifest:${manifest.packageId}:${manifest.provenance}`
    },
    capabilities: capabilitiesFor(manifest.artifactType, manifest.capabilities),
    queryAdapter: queryAdapterFor(manifest.artifactType)
  });
}

function buildPackageManifest(
  sourcePackage: SourcePackageRecipe | SourcePackageManifest,
  input: {
    packageId: string;
    artifactKind: ArtifactKindV2;
    entrypoint: string;
    provenance: NonNullable<PackageManifestV2["artifact"]["provenance"]>;
    capabilities: PackageCapabilityV2[];
    queryAdapter: QueryAdapterV2;
    dependencies?: PackageManifestV2["dependencies"];
  }
): PackageManifestV2 {
  const manifest = {
    identity: {
      schemaVersion: 2,
      packageId: input.packageId,
      packageVersion: "0.0.0",
      namespace: sourcePackage.namespace,
      displayName: humanizePackageId(input.packageId),
      description: `Local v2 source package view for ${input.packageId}`
    },
    target: {
      minecraftVersions: [sourcePackage.minecraftVersion],
      loaders: loadersFor(sourcePackage.namespace),
      mappings: mappingsFor(sourcePackage),
      kubeJsScopes:
        sourcePackage.artifactType === "probejs-snapshot"
          ? (["probejs"] as const)
          : undefined
    },
    artifact: {
      kind: input.artifactKind,
      format: artifactFormatFor(input.artifactKind),
      schemaId: schemaIdFor(input.artifactKind),
      schemaVersion: 1,
      entrypoint: input.entrypoint,
      provenance: input.provenance
    },
    capabilities: input.capabilities,
    policy: {
      privacy:
        sourcePackage.artifactType === "probejs-snapshot"
          ? "user_private" as const
          : "local_generated" as const,
      lifecycle: ["generated_on_demand", "evictable"] as const,
      canCommitToRepository: false,
      canUploadToPublicRelease: false,
      requiresUserConsent: true
    },
    query: {
      adapter: input.queryAdapter,
      capabilities: input.capabilities,
      defaultLimit: 8,
      maxLimit: 50,
      preferredFallbacks: []
    },
    dependencies: input.dependencies
  };

  return parsePackageManifestV2(manifest);
}

function humanizePackageId(packageId: string): string {
  return packageId
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
