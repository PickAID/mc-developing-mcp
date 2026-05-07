import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { executeMcpServerSourceAcquisitionPlan } from "./source-acquisition-plan-executor.js";
import type { McpServerEvidenceExecutorInput } from "../request/execution/request-handler.js";

describe("executeMcpServerSourceAcquisitionPlan workspace execution", () => {
  it("executes Gradle workspace routes with the default workspace handler", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-acq-gradle-"));

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      [
        "repositories {",
        "  mavenCentral()",
        "  maven { url = 'https://maven.neoforged.net/releases' }",
        "}",
        "dependencies {",
        "  modImplementation 'net.neoforged:neoforge:21.1.1'",
        "}"
      ].join("\n")
    );

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot)
    );
    const payload = result.payload as {
      routes: unknown[];
      workItems: unknown[];
      workItemExecutions: Array<{
        kind: string;
        status: string;
        payload?: unknown;
      }>;
    };

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan"
      }
    });
    expect(payload.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: "workspace_gradle",
          artifactStrategy: "read_declared_dependencies"
        })
      ])
    );
    expect(payload.workItems).toEqual(
      expect.arrayContaining([
        {
          kind: "workspace_gradle_dependencies",
          workspaceRoot,
          cacheScope: "workspace_overlay"
        }
      ])
    );
    expect(payload.workItemExecutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workspace_gradle_dependencies",
          status: "completed",
          payload: expect.objectContaining({
            source: "workspace_gradle",
            workspaceRoot,
            dependencyCount: 1,
            repositoryCount: 2,
            dependencies: [
              {
                group: "net.neoforged",
                artifact: "neoforge",
                version: "21.1.1",
                notation: "net.neoforged:neoforge:21.1.1",
                sourceFile: "build.gradle"
              }
            ]
          })
        })
      ])
    );
  });

  it("executes ProbeJS workspace routes with the default workspace handler", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-acq-probe-"));

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      "plugins { id 'dev.latvian.mods.kubejs' }\n"
    );
    await mkdir(join(workspaceRoot, "kubejs", "probejs", "items"), {
      recursive: true
    });
    await writeFile(
      join(workspaceRoot, "kubejs", "probejs", "items", "minecraft.txt"),
      "minecraft:stone\nminecraft:dirt\n"
    );

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot, {
        hasKubeJS: true,
        hasProbeJS: true,
        requestText: "KubeJS list item registry minecraft:stone"
      })
    );
    const payload = result.payload as {
      workItems: unknown[];
      workItemExecutions: Array<{
        kind: string;
        status: string;
        payload?: unknown;
      }>;
    };

    expect(payload.workItems).toEqual(
      expect.arrayContaining([
        {
          kind: "workspace_probejs_types",
          workspaceRoot,
          cacheScope: "workspace_overlay"
        }
      ])
    );
    expect(payload.workItemExecutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workspace_probejs_types",
          status: "completed",
          payload: expect.objectContaining({
            source: "probejs_resources",
            queryMode: "resource_summary"
          })
        })
      ])
    );
  });
});

function inputFixture(
  workspaceRoot: string,
  input: {
    hasKubeJS?: boolean;
    hasProbeJS?: boolean;
    requestText?: string;
  } = {}
): McpServerEvidenceExecutorInput {
  const requestText =
    input.requestText ?? "Need workspace Gradle dependency source evidence.";

  return {
    candidate: {
      id: "candidate-source-acquisition",
      priority: 1,
      tier: "primary",
      routeStep: "source_acquisition_plan",
      provenance: "source_acquisition",
      preferredTool: "context.query",
      estimatedCost: "low",
      reliability: "high",
      reason: "Plan source acquisition.",
      pathHints: [],
      queryHint: requestText
    },
    evidencePlan: {
      appId: "mcp-server",
      requestPlan: requestPlanFixture(workspaceRoot, input),
      candidates: [],
      trace: {
        routeSteps: ["source_acquisition_plan"],
        candidateIds: [],
        fallbackCandidateIds: []
      }
    },
    requestPlan: requestPlanFixture(workspaceRoot, input)
  };
}

function requestPlanFixture(
  workspaceRoot: string,
  input: {
    hasKubeJS?: boolean;
    hasProbeJS?: boolean;
    requestText?: string;
  } = {}
): McpServerEvidenceExecutorInput["requestPlan"] {
  const requestText =
    input.requestText ?? "Need workspace Gradle dependency source evidence.";

  return {
    appId: "mcp-server",
    requestText,
    requestContext: {
      workspaceContext: {
        workspaceRoot,
        detectorPackage: "@mcpskill/workspace-detector",
        descriptor: {
          root: workspaceRoot,
          kind: "java-mod",
          hasGradle: true,
          hasKubeJS: input.hasKubeJS ?? false,
          hasProbeJS: input.hasProbeJS ?? false,
          hasModArchives: false,
          hasJavaSource: false,
          hasDatapack: false,
          buildFiles: [join(workspaceRoot, "build.gradle")],
          javaSourceRoots: [],
          modArchivePaths: [],
          datapackRoots: [],
          logPaths: [],
          reasons: ["fixture"],
          currentRuntime: {
            minecraftVersion: "1.21.1",
            loader: "neoforge",
            source: "workspace-detect",
            confidence: "high",
            evidenceSources: ["fixture"],
            candidates: [],
            evidence: []
          }
        }
      }
    },
    toolGuidance: {
      availableTools: ["context.query"],
      preferredTools: ["context.query"],
      routeSteps: ["source_acquisition_plan"]
    },
    trace: {
      bootstrapKind: "mcp-server"
    }
  };
}
