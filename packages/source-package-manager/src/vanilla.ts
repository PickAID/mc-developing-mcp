import type {
  SourcePackageCoordinate,
  SourcePackageVariant
} from "@mcpskill/shared-types";

import type { SourcePackageRecipe } from "./contracts.js";

export function buildVanillaSourcePackCoordinate(
  minecraftVersion: string,
  variant: SourcePackageVariant = "named"
): SourcePackageCoordinate {
  return {
    packageId: `minecraft-${minecraftVersion}-source-pack-${variant}`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "source-pack",
    variant
  };
}

export function buildVanillaSourcePackCopyRecipe(input: {
  minecraftVersion: string;
  sourceRoot: string;
  provenance?: string;
  variant?: SourcePackageVariant;
}): SourcePackageRecipe {
  const coordinate = buildVanillaSourcePackCoordinate(
    input.minecraftVersion,
    input.variant
  );

  return {
    ...coordinate,
    provenance: input.provenance ?? "materialized-local-copy",
    steps: [
      {
        kind: "copy_tree",
        sourceRoot: input.sourceRoot
      },
      {
        kind: "build_source_index"
      },
      {
        kind: "write_package_manifest"
      }
    ]
  };
}

export function buildVanillaSourcePackZipRecipe(input: {
  minecraftVersion: string;
  sourceZip: string;
  provenance?: string;
  variant?: SourcePackageVariant;
}): SourcePackageRecipe {
  const coordinate = buildVanillaSourcePackCoordinate(
    input.minecraftVersion,
    input.variant
  );

  return {
    ...coordinate,
    provenance: input.provenance ?? "java-sources-zip",
    steps: [
      {
        kind: "extract_java_sources_zip",
        sourceZip: input.sourceZip
      },
      {
        kind: "build_source_index"
      },
      {
        kind: "write_package_manifest"
      }
    ]
  };
}
