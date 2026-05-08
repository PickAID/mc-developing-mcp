import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { executeMcpServerSourceAcquisitionPlan } from "./source-acquisition-plan-executor.js";
import type { McpServerEvidenceExecutorInput } from "../request/execution/request-handler.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("source acquisition ProbeJS payload budget", () => {
  it("summarizes large workspace_probejs_types resources without raw ProbeJS file payloads", async () => {
    const workspaceRoot = await mkdtemp(
      join(tmpdir(), "mcpskill-source-acq-probe-budget-")
    );
    tempRoots.push(workspaceRoot);

    const probeItemLines = Array.from(
      { length: 160 },
      (_, index) => `budgetpack:item_${index.toString().padStart(3, "0")}`
    );
    const lateUnbudgetedItem = "budgetpack:payload_budget_marker_159";
    probeItemLines[159] = lateUnbudgetedItem;
    const rawProbeFileText = `${probeItemLines.join("\n")}\n`;

    await writeText(
      join(workspaceRoot, "build.gradle"),
      "plugins { id 'dev.latvian.mods.kubejs' }\n"
    );
    await writeText(
      join(workspaceRoot, "kubejs", "probejs", "items", "budgetpack.txt"),
      rawProbeFileText
    );

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot)
    );
    const payload = result.payload as {
      workItemExecutions: Array<{
        kind: string;
        status: string;
        payload?: {
          source?: string;
          queryMode?: string;
          probeResources?: {
            summary?: {
              counts?: Record<string, number>;
              totalCounts?: Record<string, number>;
            };
            entries?: {
              item?: Array<{ name: string; value: string; file: string }>;
            };
          };
        };
      }>;
    };
    const probeExecution = payload.workItemExecutions.find(
      (execution) => execution.kind === "workspace_probejs_types"
    );

    expect(probeExecution).toMatchObject({
      status: "completed",
      payload: {
        source: "probejs_resources",
        queryMode: "resource_summary"
      }
    });

    const probePayload = probeExecution?.payload;
    const itemEntries = probePayload?.probeResources?.entries?.item ?? [];

    expect(itemEntries).toHaveLength(20);
    expect(probePayload?.probeResources?.summary?.counts?.item).toBe(20);
    expect(probePayload?.probeResources?.summary?.totalCounts?.item).toBe(160);
    expect(itemEntries).toContainEqual(
      expect.objectContaining({
        name: "budgetpack:item_000",
        value: "budgetpack:item_000",
        file: "kubejs/probejs/items/budgetpack.txt"
      })
    );

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(rawProbeFileText);
    expect(serialized).not.toContain(lateUnbudgetedItem);
  });
});

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

function inputFixture(workspaceRoot: string): McpServerEvidenceExecutorInput {
  const requestText = "List KubeJS ProbeJS items in this workspace.";

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
      requestPlan: requestPlanFixture(workspaceRoot, requestText),
      candidates: [],
      trace: {
        routeSteps: ["source_acquisition_plan"],
        candidateIds: [],
        fallbackCandidateIds: []
      }
    },
    requestPlan: requestPlanFixture(workspaceRoot, requestText)
  };
}

function requestPlanFixture(
  workspaceRoot: string,
  requestText: string
): McpServerEvidenceExecutorInput["requestPlan"] {
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
          hasKubeJS: true,
          hasProbeJS: true,
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
