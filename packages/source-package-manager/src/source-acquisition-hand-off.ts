import type {
  SourceAcquisitionRemoteSource,
  SourceAcquisitionRoute
} from "./source-acquisition-plan.js";

export type SourceAcquisitionWorkItem =
  | {
      kind: "jar_index";
      sourceArchive: string;
      cacheScope: "private_runtime";
    }
  | {
      kind: "vanilla_generation";
      minecraftVersion: string;
      cacheScope: "private_runtime";
    }
  | {
      kind: "remote_metadata";
      source: Exclude<SourceAcquisitionRemoteSource, "official">;
      cacheScope: "metadata";
    };

export interface SourceAcquisitionWorkItemInput {
  route: SourceAcquisitionRoute;
  paths?: string[];
  minecraftVersion?: string;
}

export function buildSourceAcquisitionWorkItems(
  input: SourceAcquisitionWorkItemInput
): SourceAcquisitionWorkItem[] {
  switch (input.route.artifactStrategy) {
    case "index_binary_jar":
      return buildJarIndexWorkItems(input.paths);
    case "generate_vanilla_source_or_assets":
      return buildVanillaGenerationWorkItem(input.minecraftVersion);
    case "resolve_remote_jar_metadata":
    case "resolve_remote_source_repository":
      return buildRemoteMetadataWorkItem(input.route.origin);
    default:
      return [];
  }
}

function buildJarIndexWorkItems(
  paths?: string[]
): SourceAcquisitionWorkItem[] {
  return (paths ?? []).map((sourceArchive) => ({
    kind: "jar_index",
    sourceArchive,
    cacheScope: "private_runtime"
  }));
}

function buildVanillaGenerationWorkItem(
  minecraftVersion?: string
): SourceAcquisitionWorkItem[] {
  if (!minecraftVersion) {
    return [];
  }

  return [
    {
      kind: "vanilla_generation",
      minecraftVersion,
      cacheScope: "private_runtime"
    }
  ];
}

function buildRemoteMetadataWorkItem(
  origin: SourceAcquisitionRoute["origin"]
): SourceAcquisitionWorkItem[] {
  if (
    origin !== "modrinth" &&
    origin !== "curseforge" &&
    origin !== "github"
  ) {
    return [];
  }

  return [
    {
      kind: "remote_metadata",
      source: origin,
      cacheScope: "metadata"
    }
  ];
}
