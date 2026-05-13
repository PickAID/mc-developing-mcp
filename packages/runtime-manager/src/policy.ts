import type { ManagedRuntimePolicy } from "minecraft-developing-mcp-shared-types";
import { RUNTIME_MANAGER_VERSION } from "./version.js";

export function createDefaultRuntimePolicy(
  runtimeRoot: string
): ManagedRuntimePolicy {
  return {
    mode: "managed-first",
    allowSystemFallback: false,
    runtimeRoot,
    runtimeVersion: RUNTIME_MANAGER_VERSION,
    requiredArtifacts: [
      { id: "jdk", version: "17" },
      { id: "jdtls", version: "latest" },
      { id: "gradle-support", version: "wrapper-aware" }
    ]
  };
}
