import type { AgentRuntimePromptFragment } from "@mcpskill/shared-types";

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
      "Use datapack data/assets namespaces and concrete JSON content before docs fallback."
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
    `Gradle: ${profile.capabilities.gradle.status}, source archives=${profile.capabilities.gradle.sourceArchiveCount}`,
    `Java LSP: ${profile.capabilities.javaLsp.status}, implemented=${formatImplementedLspOperations(profile)}`,
    `ProbeJS types: ${profile.capabilities.kubejsTypes.status}, files=${profile.capabilities.kubejsTypes.fileCount}`,
    `Datapack: ${profile.capabilities.datapack.status}, namespaces=${profile.capabilities.datapack.namespaces.join(",") || "none"}`,
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
