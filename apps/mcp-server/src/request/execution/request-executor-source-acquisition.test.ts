import { describe, expect, it } from "vitest";

import { executeMcpServerRequest } from "./request-executor.js";

describe("executeMcpServerRequest source acquisition planning", () => {
  it("selects source acquisition directly for broad workspace preparation requests", async () => {
    const result = await executeMcpServerRequest({
      bootstrap: {
        runtimePolicy: { runtimeRoot: "/tmp/mcpskill-runtime" },
        workspaceContext: {
          workspaceRoot: "/packs/demo",
          detectorPackage: "minecraft-developing-mcp-workspace-detector",
          descriptor: {
            root: "/packs/demo",
            kind: "modpack",
            hasGradle: false,
            hasKubeJS: true,
            hasProbeJS: true,
            hasModArchives: true,
            hasJavaSource: false,
            hasDatapack: true,
            hasResourcePack: true,
            buildFiles: [],
            javaSourceRoots: [],
            modArchivePaths: ["/packs/demo/mods/example.jar"],
            datapackRoots: ["/packs/demo/kubejs/data"],
            resourcePackRoots: ["/packs/demo/kubejs/assets"],
            logPaths: [],
            reasons: ["test modpack"],
            currentRuntime: {
              source: "unknown",
              confidence: "unknown",
              evidenceSources: [],
              candidates: [],
              evidence: []
            }
          }
        }
      },
      requestText:
        "Prepare useful bundles so the agent can later inspect dependency source and external mod code."
    });

    expect(result.selectedEvidence).toMatchObject({
      routeStep: "source_acquisition_plan",
      status: "selected",
      payload: expect.objectContaining({
        source: "source_acquisition_plan",
        capabilityGuidance: expect.objectContaining({
          capabilityMap: expect.objectContaining({
            mode: "progressive_discovery",
            routeCapabilities: expect.arrayContaining([
              expect.objectContaining({
                origin: "workspace_probejs",
                status: "ready",
                useFor: expect.arrayContaining(["KubeJS types"])
              }),
              expect.objectContaining({
                origin: "local_jar",
                status: "ready",
                useFor: expect.arrayContaining(["local mod classes"])
              })
            ])
          })
        })
      })
    });
    expect(result.trace).toMatchObject({
      selectedCandidateId: "candidate-1-source_acquisition_plan",
      contextCandidateIds: []
    });
  });

  it("uses source acquisition as context before selecting external mod evidence", async () => {
    const result = await executeMcpServerRequest({
      bootstrap: {
        runtimePolicy: { runtimeRoot: "/tmp/mcpskill-runtime" },
        workspaceContext: undefined
      },
      requestText: "Find source for a NeoForge mod from Modrinth without a workspace.",
      contextQuery: {
        externalModResolutionExecutor: ({ candidate }) => ({
          matched: candidate.routeStep === "external_mod_resolution",
          summary: "Resolved external mod candidate.",
          payload: {
            source: "external_mod_resolution",
            candidateId: candidate.id
          }
        })
      }
    });

    expect(result.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          routeStep: "source_acquisition_plan",
          status: "context",
          payload: expect.objectContaining({
            source: "source_acquisition_plan"
          })
        }),
        expect.objectContaining({
          routeStep: "external_mod_resolution",
          status: "selected",
          payload: expect.objectContaining({
            source: "external_mod_resolution"
          })
        })
      ])
    );
    expect(result.trace).toMatchObject({
      contextCandidateIds: ["candidate-1-source_acquisition_plan"],
      selectedCandidateId: "candidate-2-external_mod_resolution"
    });
  });
});
