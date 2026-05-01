import type {
  SourcePackageCoordinate,
  SourcePackageVariant
} from "@mcpskill/shared-types";

import type {
  SourcePackageRecipe,
  SourcePackageRecipeProvider
} from "./contracts.js";

const PISTON_VERSION_MANIFEST_V2 =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

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

export function buildVanillaDataPackArchiveRecipe(input: {
  minecraftVersion: string;
  sourceArchive: string;
  provenance?: string;
}): SourcePackageRecipe {
  const coordinate = buildVanillaDataPackCoordinate(input.minecraftVersion);

  return {
    ...coordinate,
    provenance: input.provenance ?? "mojang-official-archive",
    steps: [
      {
        kind: "extract_archive_content",
        sourceArchive: input.sourceArchive,
        domains: ["data"]
      },
      {
        kind: "write_package_manifest"
      }
    ]
  };
}

export function buildVanillaDataPackRemoteArchiveRecipe(input: {
  minecraftVersion: string;
  sourceUrl: string;
  provenance?: string;
}): SourcePackageRecipe {
  const coordinate = buildVanillaDataPackCoordinate(input.minecraftVersion);

  return {
    ...coordinate,
    provenance: input.provenance ?? "mojang-piston-manifest",
    steps: [
      {
        kind: "extract_remote_archive_content",
        sourceUrl: input.sourceUrl,
        downloadFileName: `minecraft-${input.minecraftVersion}-server.jar`,
        domains: ["data"]
      },
      {
        kind: "write_package_manifest"
      }
    ]
  };
}

export function buildVanillaAssetsArchiveRecipe(input: {
  minecraftVersion: string;
  sourceArchive: string;
  provenance?: string;
}): SourcePackageRecipe {
  const coordinate = buildVanillaAssetsCoordinate(input.minecraftVersion);

  return {
    ...coordinate,
    provenance: input.provenance ?? "mojang-official-archive",
    steps: [
      {
        kind: "extract_archive_content",
        sourceArchive: input.sourceArchive,
        domains: ["assets"]
      },
      {
        kind: "write_package_manifest"
      }
    ]
  };
}

export function buildVanillaResourcePackArchiveRecipe(input: {
  minecraftVersion: string;
  sourceArchive: string;
  provenance?: string;
}): SourcePackageRecipe {
  const coordinate = buildVanillaResourcePackCoordinate(input.minecraftVersion);

  return {
    ...coordinate,
    provenance: input.provenance ?? "mojang-official-archive",
    steps: [
      {
        kind: "extract_archive_content",
        sourceArchive: input.sourceArchive,
        domains: ["assets"]
      },
      {
        kind: "write_package_manifest"
      }
    ]
  };
}

export function buildVanillaAssetsRemoteArchiveRecipe(input: {
  minecraftVersion: string;
  sourceUrl: string;
  provenance?: string;
}): SourcePackageRecipe {
  const coordinate = buildVanillaAssetsCoordinate(input.minecraftVersion);

  return {
    ...coordinate,
    provenance: input.provenance ?? "mojang-piston-manifest",
    steps: [
      {
        kind: "extract_remote_archive_content",
        sourceUrl: input.sourceUrl,
        downloadFileName: `minecraft-${input.minecraftVersion}-client.jar`,
        domains: ["assets"]
      },
      {
        kind: "write_package_manifest"
      }
    ]
  };
}

export function buildVanillaResourcePackRemoteArchiveRecipe(input: {
  minecraftVersion: string;
  sourceUrl: string;
  provenance?: string;
}): SourcePackageRecipe {
  const coordinate = buildVanillaResourcePackCoordinate(input.minecraftVersion);

  return {
    ...coordinate,
    provenance: input.provenance ?? "mojang-piston-manifest",
    steps: [
      {
        kind: "extract_remote_archive_content",
        sourceUrl: input.sourceUrl,
        downloadFileName: `minecraft-${input.minecraftVersion}-client.jar`,
        domains: ["assets"]
      },
      {
        kind: "write_package_manifest"
      }
    ]
  };
}

export function buildMojangVanillaDataPackRecipeProvider(input: {
  versionManifestUrl?: string;
} = {}): SourcePackageRecipeProvider {
  return async (sourcePackage) => {
    if (!isVanillaDataPackCoordinate(sourcePackage)) {
      return undefined;
    }

    const sourceUrl = await resolveMojangArchiveUrl({
      minecraftVersion: sourcePackage.minecraftVersion,
      versionManifestUrl: input.versionManifestUrl,
      preference: "server-first"
    });

    if (!sourceUrl) {
      return undefined;
    }

    return buildVanillaDataPackRemoteArchiveRecipe({
      minecraftVersion: sourcePackage.minecraftVersion,
      sourceUrl
    });
  };
}

export function buildMojangVanillaAssetsRecipeProvider(input: {
  versionManifestUrl?: string;
} = {}): SourcePackageRecipeProvider {
  return async (sourcePackage) => {
    if (!isVanillaAssetsCoordinate(sourcePackage)) {
      return undefined;
    }

    const sourceUrl = await resolveMojangArchiveUrl({
      minecraftVersion: sourcePackage.minecraftVersion,
      versionManifestUrl: input.versionManifestUrl,
      preference: "client-first"
    });

    if (!sourceUrl) {
      return undefined;
    }

    return buildVanillaAssetsRemoteArchiveRecipe({
      minecraftVersion: sourcePackage.minecraftVersion,
      sourceUrl
    });
  };
}

export function buildMojangVanillaResourcePackRecipeProvider(input: {
  versionManifestUrl?: string;
} = {}): SourcePackageRecipeProvider {
  return async (sourcePackage) => {
    if (!isVanillaResourcePackCoordinate(sourcePackage)) {
      return undefined;
    }

    const sourceUrl = await resolveMojangArchiveUrl({
      minecraftVersion: sourcePackage.minecraftVersion,
      versionManifestUrl: input.versionManifestUrl,
      preference: "client-first"
    });

    if (!sourceUrl) {
      return undefined;
    }

    return buildVanillaResourcePackRemoteArchiveRecipe({
      minecraftVersion: sourcePackage.minecraftVersion,
      sourceUrl
    });
  };
}

export function buildVanillaDataPackCoordinate(
  minecraftVersion: string
): SourcePackageCoordinate {
  return {
    packageId: `minecraft-${minecraftVersion}-vanilla-datapack-official`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "datapack",
    variant: "official"
  };
}

export function buildVanillaResourcePackCoordinate(
  minecraftVersion: string
): SourcePackageCoordinate {
  return {
    packageId: `minecraft-${minecraftVersion}-vanilla-resource-pack-official`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "resource-pack",
    variant: "official"
  };
}

export function buildVanillaAssetsCoordinate(
  minecraftVersion: string
): SourcePackageCoordinate {
  return {
    packageId: `minecraft-${minecraftVersion}-vanilla-assets-official`,
    namespace: "minecraft",
    minecraftVersion,
    artifactType: "assets",
    variant: "official"
  };
}

function isVanillaDataPackCoordinate(
  sourcePackage: SourcePackageCoordinate
): boolean {
  return (
    sourcePackage.packageId ===
      `minecraft-${sourcePackage.minecraftVersion}-vanilla-datapack-official` &&
    sourcePackage.namespace === "minecraft" &&
    sourcePackage.artifactType === "datapack" &&
    sourcePackage.variant === "official"
  );
}

function isVanillaResourcePackCoordinate(
  sourcePackage: SourcePackageCoordinate
): boolean {
  return (
    sourcePackage.packageId ===
      `minecraft-${sourcePackage.minecraftVersion}-vanilla-resource-pack-official` &&
    sourcePackage.namespace === "minecraft" &&
    sourcePackage.artifactType === "resource-pack" &&
    sourcePackage.variant === "official"
  );
}

function isVanillaAssetsCoordinate(
  sourcePackage: SourcePackageCoordinate
): boolean {
  return (
    sourcePackage.packageId ===
      `minecraft-${sourcePackage.minecraftVersion}-vanilla-assets-official` &&
    sourcePackage.namespace === "minecraft" &&
    sourcePackage.artifactType === "assets" &&
    sourcePackage.variant === "official"
  );
}

async function resolveMojangArchiveUrl(input: {
  minecraftVersion: string;
  versionManifestUrl?: string;
  preference: "server-first" | "client-first";
}): Promise<string | undefined> {
  const versionManifest = await fetchJson<MojangVersionManifest>(
    input.versionManifestUrl ?? PISTON_VERSION_MANIFEST_V2
  );
  const versionEntry = versionManifest.versions.find(
    (entry) => entry.id === input.minecraftVersion
  );

  if (!versionEntry) {
    return undefined;
  }

  const versionMetadata = await fetchJson<MojangVersionMetadata>(
    versionEntry.url
  );

  if (input.preference === "client-first") {
    return (
      versionMetadata.downloads.client?.url ??
      versionMetadata.downloads.server?.url
    );
  }

  return (
    versionMetadata.downloads.server?.url ??
    versionMetadata.downloads.client?.url
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch Mojang metadata: HTTP ${response.status}`);
  }

  return await response.json() as T;
}

interface MojangVersionManifest {
  versions: Array<{
    id: string;
    url: string;
  }>;
}

interface MojangVersionMetadata {
  downloads: {
    server?: {
      url: string;
    };
    client?: {
      url: string;
    };
  };
}
