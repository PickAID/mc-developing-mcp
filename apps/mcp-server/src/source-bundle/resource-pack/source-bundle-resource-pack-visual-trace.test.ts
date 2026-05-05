import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "../core/source-bundle-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("source.bundle resource-pack visual trace", () => {
  it("traces particle, atlas, and font texture references through source.bundle", async () => {
    const workspaceRoot = await createVisualResourceWorkspace();
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: { workspaceRoot }
    });
    const requestPlan = buildMcpServerRequestPlan(
      bootstrap,
      [
        "Trace visual resource references for",
        "assets/demo/particles/spark.json,",
        "assets/demo/atlases/blocks.json, and",
        "assets/demo/font/panel.json."
      ].join(" ")
    );
    const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
    const candidate = evidencePlan.candidates.find(
      (entry) => entry.routeStep === "datapack_files"
    );

    if (!candidate) {
      throw new Error("datapack_files candidate missing");
    }

    await expect(
      buildMcpServerSourceBundleExecutor({ runtimeRoot: "/tmp/mcpskill-runtime" })({
        candidate,
        evidencePlan,
        requestPlan
      })
    ).resolves.toMatchObject({
      matched: true,
      payload: {
        resourceReferenceTrace: {
          tokenPolicy: "explicit_trace",
          references: expect.arrayContaining([
            expect.objectContaining({
              relation: "particle_texture",
              toPath: "assets/demo/textures/particle/spark.png",
              status: "resolved"
            }),
            expect.objectContaining({
              relation: "atlas_texture",
              toPath: "assets/demo/textures/block/machine.png",
              status: "resolved"
            }),
            expect.objectContaining({
              relation: "font_texture",
              toPath: "assets/demo/textures/font/panel.png",
              status: "resolved"
            })
          ])
        }
      }
    });
  });
});

async function createVisualResourceWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-visual-trace-"));
  tempRoots.push(root);

  await writeText(
    join(root, "assets", "demo", "particles", "spark.json"),
    JSON.stringify({ textures: ["demo:particle/spark"] })
  );
  await writeText(
    join(root, "assets", "demo", "atlases", "blocks.json"),
    JSON.stringify({ sources: [{ type: "single", resource: "demo:block/machine" }] })
  );
  await writeText(
    join(root, "assets", "demo", "font", "panel.json"),
    JSON.stringify({ providers: [{ type: "bitmap", file: "demo:font/panel.png" }] })
  );
  await writeText(
    join(root, "assets", "demo", "textures", "particle", "spark.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47])
  );
  await writeText(
    join(root, "assets", "demo", "textures", "block", "machine.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47])
  );
  await writeText(
    join(root, "assets", "demo", "textures", "font", "panel.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47])
  );

  return root;
}

async function writeText(path: string, content: string | Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
