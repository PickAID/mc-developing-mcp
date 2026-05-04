import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { scanClientVisualSourceEvidence } from "./client-visual-source-scanner.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("scanClientVisualSourceEvidence", () => {
  it("finds bounded Java client visual source evidence", async () => {
    const root = await createTempRoot();
    const javaRoot = join(root, "src", "main", "java");

    await writeText(
      join(javaRoot, "demo", "client", "DemoClient.java"),
      [
        "package demo.client;",
        "import net.minecraft.client.renderer.blockentity.BlockEntityRenderers;",
        "class DemoClient {",
        "  void setup(FMLClientSetupEvent event) {",
        "    BlockEntityRenderers.register(DemoBlockEntities.GEAR.get(), GearRenderer::new);",
        "    MenuScreens.register(DemoMenus.GEAR.get(), GearScreen::new);",
        "    event.registerLayerDefinition(new ModelLayerLocation(new ResourceLocation(\"demo\", \"gear\"), \"main\"), GearModel::createBodyLayer);",
        "  }",
        "}"
      ].join("\n")
    );
    await writeText(
      join(javaRoot, "demo", "Registry.java"),
      "class Registry { DeferredRegister<Block> BLOCKS; RegistryObject<Block> GEAR; }\n"
    );

    await expect(
      scanClientVisualSourceEvidence({
        workspaceRoot: root
      })
    ).resolves.toMatchObject({
      tokenPolicy: "compact_client_visual_source_scan",
      scannedFiles: 2,
      counts: {
        candidateRegistries: 1,
        candidateClientInit: 1,
        candidateRendererBindings: 1,
        candidateScreenRegistrations: 1,
        candidateModelLayerRegistrations: 1,
        resourceLocationReferences: 1
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: "candidateRendererBindings",
          file: "src/main/java/demo/client/DemoClient.java",
          language: "java"
        }),
        expect.objectContaining({
          kind: "candidateRegistries",
          file: "src/main/java/demo/Registry.java"
        })
      ])
    });
  });

  it("finds KubeJS client visual hooks without treating KubeJS as generic JS", async () => {
    const root = await createTempRoot();

    await writeText(
      join(root, "kubejs", "client_scripts", "visuals.js"),
      [
        "ClientEvents.lang('en_us', event => {",
        "  event.add('block.demo.gear', 'Gear');",
        "});",
        "const id = 'demo:block/gear';"
      ].join("\n")
    );

    await expect(
      scanClientVisualSourceEvidence({
        workspaceRoot: root
      })
    ).resolves.toMatchObject({
      counts: {
        kubeJsClientHooks: 1,
        resourceLocationReferences: 1
      },
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: "kubeJsClientHooks",
          file: "kubejs/client_scripts/visuals.js",
          language: "kubejs",
          symbol: "ClientEvents"
        })
      ])
    });
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mcpskill-client-source-"));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
