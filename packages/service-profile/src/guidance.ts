import type { AgentRuntimePromptFragment } from "minecraft-developing-mcp-shared-types";

import type { MinecraftServiceProfile } from "./types.js";

export function buildServiceProfileGuidance(
  profile: Omit<MinecraftServiceProfile, "guidance">
): string[] {
  const guidance: string[] = [];

  if (profile.capabilities.gradle.status === "ready") {
    guidance.push(
      "Use Gradle files and discovered source archives before guessing external mod or Minecraft classes."
    );
  }

  if (profile.capabilities.javaLsp.status === "ready") {
    guidance.push(
      "Use Java LSP operations for workspace symbols, definitions, references, hover, and diagnostics when Java evidence is needed."
    );
  }

  if (profile.capabilities.kubejsTypes.status === "ready") {
    guidance.push(
      "Use ProbeJS/d.ts evidence before generic JavaScript assumptions for KubeJS."
    );
  }

  if (profile.capabilities.datapack.status === "ready") {
    guidance.push(
      "Use datapack data namespaces and concrete JSON content before docs fallback."
    );
  }

  if (profile.capabilities.resourcePack.status === "ready") {
    guidance.push(
      "Use resource-pack assets, model references, and pack metadata before docs fallback."
    );
    guidance.push(
      "For client visual tasks, check assets/models/blockstates plus registry and renderer wiring before docs."
    );
  }

  if (profile.capabilities.modArchives.status === "ready") {
    guidance.push(
      "Use discovered mod jar data/assets/source content for external mod evidence before assuming it is absent."
    );
  }

  if (profile.capabilities.sourceIndex.status === "ready") {
    guidance.push(
      "Use local SQLite source indexes as an accelerator; source files remain the authority."
    );
  }

  return guidance;
}

export function formatServiceProfilePrompt(profile: MinecraftServiceProfile): string {
  return [
    `Workspace kind: ${profile.workspaceKind}`,
    `Runtime: ${profile.runtime?.minecraftVersion ?? "unknown"} / ${profile.runtime?.loader ?? "unknown"}`,
    [
      `Gradle: ${profile.capabilities.gradle.status}`,
      `source archives=${profile.capabilities.gradle.sourceArchiveCount}`,
      `declared source archives=${profile.capabilities.gradle.declaredDependencySourceArchiveCount}`,
      `binary archives=${profile.capabilities.gradle.declaredDependencyBinaryArchiveCount}`
    ].join(", "),
    `Java LSP: ${profile.capabilities.javaLsp.status}, implemented=${formatImplementedLspOperations(profile)}`,
    `ProbeJS types: ${profile.capabilities.kubejsTypes.status}, files=${profile.capabilities.kubejsTypes.fileCount}`,
    `Datapack: ${profile.capabilities.datapack.status}, data=${profile.capabilities.datapack.fileCount}, namespaces=${profile.capabilities.datapack.namespaces.join(",") || "none"}`,
    `Resource pack: ${profile.capabilities.resourcePack.status}, assets=${profile.capabilities.resourcePack.fileCount}, kinds=${profile.capabilities.resourcePack.assetKinds.join(",") || "none"}`,
    `Mod archives: ${profile.capabilities.modArchives.status}, archives=${profile.capabilities.modArchives.archiveCount}`,
    `Source indexes: ${profile.capabilities.sourceIndex.status}, databases=${profile.capabilities.sourceIndex.databaseCount}`,
    ...profile.guidance.map((entry) => `Guidance: ${entry}`)
  ].join("\n");
}

function formatImplementedLspOperations(profile: MinecraftServiceProfile): string {
  const operations = profile.capabilities.javaLsp.operationContracts
    .filter((contract) => contract.implemented)
    .map((contract) => contract.operation);

  return operations.length > 0 ? operations.join(",") : "none";
}

export function buildServiceProfilePromptFragment(
  profile: MinecraftServiceProfile
): AgentRuntimePromptFragment {
  return {
    id: "service_profile",
    text: formatServiceProfilePrompt(profile)
  };
}
