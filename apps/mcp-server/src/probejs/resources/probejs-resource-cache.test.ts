import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { createMcpServerProbeJsTypesExecutor } from "../types/probejs-types-executor.js";
import { createProbeResourceSummaryCache } from "./probejs-resource-summary-cache.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("ProbeJS resource summary cache", () => {
  it("reuses parsed ProbeJS resource summaries for repeated requests", async () => {
    const workspaceRoot = await createProbeWorkspace();
    const cache = createProbeResourceSummaryCache({ maxEntries: 2 });
    const executor = createMcpServerProbeJsTypesExecutor({
      probeResourceSummaryCache: cache
    });
    const input = await createProbeInput(workspaceRoot);

    const first = await executor(input);
    const second = await executor(input);

    expect(first).toMatchObject({
      matched: true,
      payload: {
        probeResourceCacheHit: false,
        probeResources: {
          entries: {
            item: [
              {
                name: "minecraft:stone",
                value: "minecraft:stone"
              }
            ]
          }
        }
      }
    });
    expect(second).toMatchObject({
      matched: true,
      payload: {
        probeResourceCacheHit: true
      }
    });
    expect(cache.size()).toBe(1);
  });

  it("invalidates cached summaries when same-size ProbeJS files change", async () => {
    const workspaceRoot = await createProbeWorkspace();
    const itemFile = join(workspaceRoot, ".vscode", "item-attributes.json");
    const cache = createProbeResourceSummaryCache({ maxEntries: 2 });
    const executor = createMcpServerProbeJsTypesExecutor({
      probeResourceSummaryCache: cache
    });
    const input = await createProbeInput(workspaceRoot);

    await setMtimeMs(itemFile, 1_700_000_000_100);
    await executor(input);
    await writeText(
      itemFile,
      JSON.stringify([{ id: "minecraft:stone", localized: "Slate" }])
    );
    await setMtimeMs(itemFile, 1_700_000_000_900);
    const afterChange = await executor(input);

    expect(afterChange).toMatchObject({
      matched: true,
      payload: {
        probeResourceCacheHit: false,
        probeResources: {
          entries: {
            item: [
              {
                name: "minecraft:stone",
                value: "minecraft:stone",
                metadata: {
                  label: "Slate"
                }
              }
            ]
          }
        }
      }
    });
    expect(cache.size()).toBe(2);
  });
});

async function createProbeInput(
  workspaceRoot: string,
  requestText = "Use KubeJS server_scripts ItemEvents.foodEaten with minecraft:stone."
) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: join(workspaceRoot, ".runtime"),
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "probejs_types"
  );

  if (!candidate) {
    throw new Error("Expected probejs_types candidate.");
  }

  return { candidate, evidencePlan, requestPlan };
}

async function createProbeWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-probe-cache-"));
  tempRoots.push(workspaceRoot);

  await writeText(
    join(workspaceRoot, "kubejs", "server_scripts", "main.js"),
    "ItemEvents.foodEaten(event => { event.item.id; });\n"
  );
  await writeText(
    join(workspaceRoot, ".probe", "server", "events.d.ts"),
    [
      "declare const ItemEvents: {",
      "  foodEaten(handler: (event: { item: { id: string } }) => void): void;",
      "};",
      ""
    ].join("\n")
  );
  await writeText(
    join(workspaceRoot, ".vscode", "item-attributes.json"),
    JSON.stringify([{ id: "minecraft:stone", localized: "Stone" }])
  );

  return workspaceRoot;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

async function setMtimeMs(path: string, mtimeMs: number): Promise<void> {
  const date = new Date(mtimeMs);
  await utimes(path, date, date);
}
