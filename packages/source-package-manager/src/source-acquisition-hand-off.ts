import type {
  SourceAcquisitionRemoteSource,
  SourceAcquisitionRoute
} from "./source-acquisition-plan.js";

export type SourceAcquisitionWorkItem =
  | {
      kind: "jar_index";
      sourceArchive?: string;
      workspaceRoot?: string;
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
    }
  | {
      kind: "mapping_index";
      minecraftVersion: string;
      mappingFamily: "yarn" | "parchment" | "mojmap";
      cacheScope: "private_runtime";
    }
  | {
      kind: "workspace_gradle_dependencies";
      workspaceRoot: string;
      cacheScope: "workspace_overlay";
    }
  | {
      kind: "workspace_probejs_types";
      workspaceRoot: string;
      cacheScope: "workspace_overlay";
    };

export interface SourceAcquisitionWorkItemInput {
  route: SourceAcquisitionRoute;
  paths?: string[];
  minecraftVersion?: string;
  workspaceRoot?: string;
}

export function buildSourceAcquisitionWorkItems(
  input: SourceAcquisitionWorkItemInput
): SourceAcquisitionWorkItem[] {
  switch (input.route.artifactStrategy) {
    case "index_binary_jar":
      return buildJarIndexWorkItems({
        origin: input.route.origin,
        paths: input.paths,
        workspaceRoot: input.workspaceRoot
      });
    case "generate_vanilla_source_or_assets":
      return buildVanillaGenerationWorkItem(input.minecraftVersion);
    case "resolve_remote_jar_metadata":
    case "resolve_remote_source_repository":
      return buildRemoteMetadataWorkItem(input.route.origin);
    case "read_declared_dependencies":
      return buildWorkspaceGradleDependenciesWorkItem(input.workspaceRoot);
    case "read_probejs_types_and_registries":
      return buildWorkspaceProbeJsTypesWorkItem(input.workspaceRoot);
    default:
      return [];
  }
}

function buildJarIndexWorkItems(input: {
  origin: SourceAcquisitionRoute["origin"];
  paths?: string[];
  workspaceRoot?: string;
}): SourceAcquisitionWorkItem[] {
  if (input.origin === "local_jar" && input.workspaceRoot) {
    return [
      {
        kind: "jar_index",
        workspaceRoot: input.workspaceRoot,
        cacheScope: "private_runtime"
      }
    ];
  }

  return (input.paths ?? []).map((sourceArchive) => ({
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

function buildWorkspaceGradleDependenciesWorkItem(
  workspaceRoot?: string
): SourceAcquisitionWorkItem[] {
  if (!workspaceRoot) {
    return [];
  }

  return [
    {
      kind: "workspace_gradle_dependencies",
      workspaceRoot,
      cacheScope: "workspace_overlay"
    }
  ];
}

function buildWorkspaceProbeJsTypesWorkItem(
  workspaceRoot?: string
): SourceAcquisitionWorkItem[] {
  if (!workspaceRoot) {
    return [];
  }

  return [
    {
      kind: "workspace_probejs_types",
      workspaceRoot,
      cacheScope: "workspace_overlay"
    }
  ];
}
