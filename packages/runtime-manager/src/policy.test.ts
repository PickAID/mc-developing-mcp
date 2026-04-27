import { describe, expect, it } from "vitest";

import { createDefaultRuntimePolicy } from "./policy.js";

describe("createDefaultRuntimePolicy", () => {
  it("creates the default managed-first policy with no system fallback", () => {
    expect(createDefaultRuntimePolicy("/tmp/mcpskill-runtime")).toEqual({
      mode: "managed-first",
      allowSystemFallback: false,
      runtimeRoot: "/tmp/mcpskill-runtime",
      requiredArtifacts: [
        { id: "jdk", version: "17" },
        { id: "jdtls", version: "latest" },
        { id: "gradle-support", version: "wrapper-aware" }
      ]
    });
  });
});
