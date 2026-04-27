import type {
  CurrentRuntime,
  RuntimeConfidence,
  RuntimeDetectionSource
} from "@mcpskill/shared-types";

export interface VanillaVersionResolution {
  matched: boolean;
  minecraftVersion?: string;
  confidence?: RuntimeConfidence;
  source?: RuntimeDetectionSource;
  summary: string;
}

export function resolveVanillaMinecraftVersion(
  currentRuntime?: CurrentRuntime
): VanillaVersionResolution {
  if (!currentRuntime?.minecraftVersion) {
    return {
      matched: false,
      summary: "Workspace runtime did not provide a Minecraft version."
    };
  }

  if (
    currentRuntime.confidence !== "high" &&
    currentRuntime.confidence !== "medium"
  ) {
    return {
      matched: false,
      summary: `Workspace runtime confidence ${currentRuntime.confidence} is not authoritative enough for vanilla source resolution.`
    };
  }

  return {
    matched: true,
    minecraftVersion: currentRuntime.minecraftVersion,
    confidence: currentRuntime.confidence,
    source: currentRuntime.source,
    summary: `Resolved vanilla source version ${currentRuntime.minecraftVersion} from workspace runtime.`
  };
}
