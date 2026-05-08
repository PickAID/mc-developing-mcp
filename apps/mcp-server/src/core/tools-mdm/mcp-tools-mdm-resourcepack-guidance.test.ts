import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { registerMcpServerTools } from "../tools/mcp-tools.js";
import {
  createCapturingRegistry,
  createMdmReleaseOutForPackage,
  createSinglePackageMdmSourcesRoot,
  createWorkspaceRoot,
  mdmResourcepackGuidanceArtifactBody
} from "../../../test-fixtures/mcp-tools-mdm-resource-fixtures.js";

describe("mc_develop resourcepack guidance packages", () => {
  it("uses cached resourcepack guidance docs bundles during docs lookup", async () => {
    const registry = createCapturingRegistry();
    const release = await createMdmReleaseOutForPackage({
      body: mdmResourcepackGuidanceArtifactBody(),
      artifactName: "resourcepack-1.20.1-guidance-0.1.0.mdm-resource.json",
      packageId: "resourcepack-1.20.1-guidance",
      namespace: "resourcepack",
      version: "0.1.0",
      releaseFamily: "resourcepack-guidance"
    });
    const mdmSourcesRoot = await createSinglePackageMdmSourcesRoot({
      packageId: "resourcepack-1.20.1-guidance",
      manifestName: "resourcepack-1.20.1-guidance.json",
      release
    });
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mdm-runtime-"));
    const workspaceRoot = await createWorkspaceRoot();

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: mdmSourcesRoot,
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText:
        "For Minecraft 1.20.1 resourcepack, trace blockstate model parent texture mcmeta evidence.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestPath: release.manifestPath,
        packageId: "resourcepack-1.20.1-guidance",
        downloadPolicy: "allowed"
      }
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      selectedEvidence: {
        routeStep: "docs_lookup",
        payload: {
          hits: expect.arrayContaining([
            expect.objectContaining({
              entryId: "resourcepack-1.20.1-guidance-implementationChains-block-model-trace",
              packageId: "resourcepack-1.20.1-guidance",
              matchedTerms: expect.arrayContaining(["blockstate", "texture"])
            })
          ])
        }
      }
    });
  });
});
