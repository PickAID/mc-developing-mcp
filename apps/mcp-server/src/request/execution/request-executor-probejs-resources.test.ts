import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { executeMcpServerRequest } from "./request-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("executeMcpServerRequest ProbeJS semantic resources", () => {
  it("keeps d.ts semantic evidence when a KubeJS request also names item and tag resources", async () => {
    const workspaceRoot = await createProbeJsWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: join(workspaceRoot, ".runtime"),
      workspace: { workspaceRoot }
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText: [
        "Use KubeJS server_scripts ItemEvents.foodEaten for minecraft:stone",
        "and #forge:ingots/iron; use ProbeJS d.ts and pack resources together."
      ].join(" ")
    });

    expect(result.selectedEvidence).toMatchObject({
      routeStep: "probejs_types",
      status: "selected",
      payload: {
        source: "kubejs_language_service",
        symbol: "ItemEvents.foodEaten",
        queryMode: "virtual",
        quickInfo: expect.stringContaining("foodEaten(handler"),
        probeResources: {
          entries: {
            item: [
              {
                name: "minecraft:stone",
                value: "minecraft:stone",
                file: "kubejs/probejs/items/minecraft.txt"
              }
            ],
            tag: [
              {
                name: "forge:ingots/iron",
                value: "#forge:ingots/iron",
                file: ".vscode/item-tag-attributes.json"
              }
            ]
          }
        }
      }
    });
    expect(result.selectedEvidence?.payload).not.toMatchObject({
      source: "probejs_resources",
      queryMode: "resource_summary"
    });
  });
});

async function createProbeJsWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mc-developing-kjs-route-"));
  tempRoots.push(workspaceRoot);

  await writeText(
    join(workspaceRoot, "kubejs", "server_scripts", "main.js"),
    [
      "ItemEvents.foodEaten((event) => {",
      "  event.item.id;",
      "});",
      ""
    ].join("\n")
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
    join(workspaceRoot, ".vscode", "item-tag-attributes.json"),
    JSON.stringify([{ id: "forge:ingots/iron", items: ["minecraft:iron_ingot"] }])
  );
  await writeText(
    join(workspaceRoot, "kubejs", "probejs", "items", "minecraft.txt"),
    "minecraft:stone\nminecraft:dirt\n"
  );

  return workspaceRoot;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
