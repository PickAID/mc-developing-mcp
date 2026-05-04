import { describe, expect, it } from "vitest";

import { buildSourcePackageManifest } from "./manifest.js";

describe("buildSourcePackageManifest", () => {
  it("preserves client visual docs/source capability metadata", () => {
    expect(
      buildSourcePackageManifest(
        {
          packageId: "minecraft-26.1-docs-shader",
          namespace: "minecraft",
          minecraftVersion: "26.1",
          artifactType: "docs/shader",
          variant: "official"
        },
        {
          provenance: "mdm-release",
          stepKinds: ["extract_docs_package", "build_docs_index"],
          installedAt: "2026-05-05T00:00:00.000Z",
          capabilities: ["docs", "shader-reference", "api-proof"],
          docDomains: ["shader", "client-visual", "migration"],
          sourceDomains: ["ui", "rendering", "shader", "coremod"],
          credentialPolicy: {
            required: false,
            envVars: ["SHADERTOY_APP_KEY"],
            summary: "External shader references require a user-provided key."
          },
          evidenceAuthority: "optional-accelerator",
          migrationCoverage: ["26.1"]
        }
      )
    ).toMatchObject({
      artifactType: "docs/shader",
      capabilities: ["docs", "shader-reference", "api-proof"],
      docDomains: ["shader", "client-visual", "migration"],
      sourceDomains: ["ui", "rendering", "shader", "coremod"],
      credentialPolicy: {
        required: false,
        envVars: ["SHADERTOY_APP_KEY"]
      },
      evidenceAuthority: "optional-accelerator",
      migrationCoverage: ["26.1"]
    });
  });
});
