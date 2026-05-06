import type {
  ArtifactKindV2,
  PackageCapabilityV2,
  PackageManifestV2,
  PackageMappingV2,
  QueryAdapterV2
} from "@mcpskill/package-registry";
import type {
  SourcePackageArtifactType,
  SourcePackageManifest,
  SourcePackageNamespace
} from "@mcpskill/shared-types";

import type { SourcePackageRecipe, SourcePackageRecipeStep } from "./contracts.js";

export function artifactKindFor(
  artifactType: SourcePackageArtifactType
): ArtifactKindV2 {
  switch (artifactType) {
    case "source-pack":
      return "source_tree";
    case "source-index":
      return "source_index";
    case "datapack":
      return "datapack_bundle";
    case "resource-pack":
    case "assets":
      return "resourcepack_bundle";
    case "mapping-bundle":
      return "mapping_bundle";
    case "mod-archive-index":
      return "mod_archive_index";
    case "probejs-snapshot":
      return "probejs_snapshot";
    default:
      return "docs_bundle";
  }
}

export function capabilitiesFor(
  artifactType: SourcePackageArtifactType,
  declared: string[] = []
): PackageCapabilityV2[] {
  if (artifactType === "source-pack" || artifactType === "source-index") {
    return ["source_lookup", "source_chunk_search"];
  }
  if (artifactType === "datapack") {
    return ["resource_location_lookup", "datapack_trace"];
  }
  if (artifactType === "resource-pack" || artifactType === "assets") {
    return ["resource_location_lookup", "resourcepack_trace"];
  }
  if (artifactType === "mod-archive-index") {
    return [
      "mod_archive_owner_lookup",
      "resource_location_lookup",
      "datapack_trace",
      "resourcepack_trace"
    ];
  }
  if (artifactType === "mapping-bundle") {
    return ["mapping_lookup", "mapping_explain"];
  }
  if (artifactType === "probejs-snapshot") {
    return declared.includes("kubejs_symbol_lookup")
      ? ["kubejs_symbol_lookup"]
      : ["kubejs_symbol_lookup"];
  }

  return ["docs_search", "docs_direct_read"];
}

export function queryAdapterFor(
  artifactType: SourcePackageArtifactType
): QueryAdapterV2 {
  if (artifactType === "source-index") {
    return "source_index_sqlite";
  }
  if (artifactType === "mapping-bundle") {
    return "mapping_index";
  }
  if (
    artifactType === "datapack" ||
    artifactType === "resource-pack" ||
    artifactType === "assets" ||
    artifactType === "mod-archive-index"
  ) {
    return "archive_content";
  }

  return "source_tree";
}

export function artifactFormatFor(
  kind: ArtifactKindV2
): PackageManifestV2["artifact"]["format"] {
  return kind === "source_index" || kind === "mod_archive_index"
    ? "sqlite"
    : "directory";
}

export function entrypointFor(kind: ArtifactKindV2): string {
  if (kind === "source_index") {
    return "source-index.sqlite";
  }
  if (kind === "mod_archive_index") {
    return "mod-archive-index.sqlite";
  }

  return ".";
}

export function schemaIdFor(kind: ArtifactKindV2): string {
  switch (kind) {
    case "source_tree":
      return "mdm.sources.tree";
    case "source_index":
      return "mdm.sources.index.sqlite";
    case "datapack_bundle":
      return "mdm.datapack.directory";
    case "resourcepack_bundle":
      return "mdm.resourcepack.directory";
    case "mapping_bundle":
      return "mdm.mappings.directory";
    case "probejs_snapshot":
      return "mdm.probejs.directory";
    case "mod_archive_index":
      return "mdm.mod-archive.index.sqlite";
    default:
      return "mdm.docs.directory";
  }
}

export function provenanceFromRecipe(
  recipe: SourcePackageRecipe
): NonNullable<PackageManifestV2["artifact"]["provenance"]> {
  const sourceStep = recipe.steps.find(isSourceStep);
  if (!sourceStep) {
    return { sourceKind: "generated_local", source: `recipe:${recipe.packageId}` };
  }
  if (sourceStep.kind === "copy_tree") {
    return { sourceKind: "workspace", source: sourceStep.sourceRoot };
  }
  if (sourceStep.kind === "extract_java_sources_zip") {
    return { sourceKind: "external_archive", source: sourceStep.sourceZip };
  }
  if (sourceStep.kind === "extract_archive_content") {
    return { sourceKind: "external_archive", source: sourceStep.sourceArchive };
  }

  return { sourceKind: "public_release", source: sourceStep.sourceUrl };
}

export function mappingsFor(
  sourcePackage: SourcePackageRecipe | SourcePackageManifest
): PackageMappingV2[] {
  return [sourcePackage.variant];
}

export function loadersFor(
  namespace: SourcePackageNamespace
): PackageManifestV2["target"]["loaders"] {
  if (namespace === "minecraft") {
    return ["vanilla"];
  }
  if (namespace === "kubejs") {
    return ["kubejs"];
  }
  if (
    namespace === "forge" ||
    namespace === "neoforge" ||
    namespace === "fabric" ||
    namespace === "quilt"
  ) {
    return [namespace];
  }

  return undefined;
}

function isSourceStep(
  step: SourcePackageRecipeStep
): step is Exclude<
  SourcePackageRecipeStep,
  { kind: "build_source_index" | "write_package_manifest" }
> {
  return step.kind !== "build_source_index" && step.kind !== "write_package_manifest";
}
