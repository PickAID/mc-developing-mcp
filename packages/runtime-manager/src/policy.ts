import type { ManagedRuntimePolicy } from "@mcpskill/shared-types";

export function createDefaultRuntimePolicy(
  runtimeRoot: string
): ManagedRuntimePolicy {
  return {
    mode: "managed-first",
    allowSystemFallback: false,
    runtimeRoot,
    requiredArtifacts: [
      { id: "jdk", version: "17" },
      { id: "jdtls", version: "latest" },
      { id: "gradle-support", version: "wrapper-aware" }
    ]
  };
}
