import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { traceDatapackResourceReferences } from "./resource-references.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("traceDatapackResourceReferences", () => {
  it("traces particle, atlas, and font asset references to texture files", async () => {
    const root = await createResourceWorkspace();

    await expect(
      traceDatapackResourceReferences(root, {
        paths: [
          "assets/demo/particles/spark.json",
          "assets/demo/atlases/blocks.json",
          "assets/demo/font/panel.json"
        ]
      })
    ).resolves.toMatchObject({
      startPaths: [
        "assets/demo/particles/spark.json",
        "assets/demo/atlases/blocks.json",
        "assets/demo/font/panel.json"
      ],
      references: expect.arrayContaining([
        expect.objectContaining({
          fromPath: "assets/demo/particles/spark.json",
          fromKind: "particles",
          relation: "particle_texture",
          toPath: "assets/demo/textures/particle/spark.png",
          toKind: "textures",
          status: "resolved"
        }),
        expect.objectContaining({
          fromPath: "assets/demo/atlases/blocks.json",
          fromKind: "atlases",
          relation: "atlas_texture",
          toPath: "assets/demo/textures/block/machine.png",
          toKind: "textures",
          status: "resolved"
        }),
        expect.objectContaining({
          fromPath: "assets/demo/font/panel.json",
          fromKind: "font",
          relation: "font_texture",
          toPath: "assets/demo/textures/font/panel.png",
          toKind: "textures",
          status: "resolved"
        })
      ]),
      unresolved: []
    });
  });
});

async function createResourceWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-resource-refs-"));
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
