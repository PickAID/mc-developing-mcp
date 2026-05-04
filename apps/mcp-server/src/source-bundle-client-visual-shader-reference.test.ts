import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "./source-bundle-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("source.bundle client visual shader references", () => {
  it("keeps external shader references disabled by default", async () => {
    const result = await executeClientVisualRequest();

    expect(result.payload).toMatchObject({
      clientVisualEvidence: expect.not.objectContaining({
        externalShaderReference: expect.anything()
      })
    });
  });

  it("reports credential setup when shader references are enabled without a key", async () => {
    const previousKey = process.env.SHADERTOY_APP_KEY;
    let called = false;
    process.env.SHADERTOY_APP_KEY = "ambient-key";

    try {
      const result = await executeClientVisualRequest({
        externalShaderReference: {
          enabled: true,
          credentialProvider: () => undefined,
          fetch: async () => {
            called = true;
            return jsonResponse({});
          }
        }
      });

      expect(called).toBe(false);
      expect(result.payload).toMatchObject({
        clientVisualEvidence: {
          externalShaderReference: {
            status: "credentials_required",
            credentialEnvVar: "SHADERTOY_APP_KEY"
          }
        }
      });
    } finally {
      if (previousKey === undefined) {
        delete process.env.SHADERTOY_APP_KEY;
      } else {
        process.env.SHADERTOY_APP_KEY = previousKey;
      }
    }
  });

  it("adds compact Minecraft-mapped shader references when enabled with a key", async () => {
    const urls: string[] = [];
    const result = await executeClientVisualRequest({
      externalShaderReference: {
        enabled: true,
        apiKey: "test-key",
        apiBaseUrl: "https://example.test",
        fetch: async (url) => {
          urls.push(url.toString());
          return jsonResponse({
            Results: [
              {
                id: "glow123",
                name: "Glow Raymarch Palette",
                description: "SDF normal noise in uv space."
              }
            ]
          });
        }
      }
    });

    expect(urls[0]).toContain("key=test-key");
    expect(urls[0]).toContain("q=");
    expect(result.payload).toMatchObject({
      clientVisualEvidence: {
        externalShaderReference: {
          status: "ready",
          tokenPolicy: "compact_shader_formula_reference",
          summaries: [
            {
              title: "Glow Raymarch Palette",
              shaderId: "glow123",
              formulaTerms: expect.arrayContaining(["noise", "sdf", "raymarch"]),
              minecraftMapping: {
                uniforms: ["time_or_state", "resolution_or_bounds"],
                samplers: ["source_texture_or_atlas_sprite"],
                renderTargets: ["screen_or_post_chain_target"],
                lifecycle: ["resource_reload", "fallback_when_unavailable"]
              }
            }
          ]
        }
      }
    });
  });
});

async function executeClientVisualRequest(
  sourceBundle?: Parameters<typeof buildMcpServerSourceBundleExecutor>[0]
) {
  const runtimeRoot = await createTempRoot("mcpskill-runtime-");
  const workspaceRoot = await createClientVisualWorkspace();
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot,
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(
    bootstrap,
    "Build a glowing animated client renderer and shader pass for demo:block/glow."
  );
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "datapack_files"
  );

  if (!candidate) {
    throw new Error("datapack_files candidate missing");
  }

  const executor = buildMcpServerSourceBundleExecutor({
    runtimeRoot,
    ...sourceBundle
  });

  return executor({
    candidate,
    evidencePlan,
    requestPlan
  });
}

async function createClientVisualWorkspace(): Promise<string> {
  const root = await createTempRoot("mcpskill-client-shader-");

  await writeText(
    join(root, "build.gradle"),
    [
      'plugins { id "net.minecraftforge.gradle" }',
      "dependencies {",
      '  minecraft "net.minecraftforge:forge:1.20.1-47.2.0"',
      "}"
    ].join("\n")
  );
  await writeText(
    join(root, "src", "main", "java", "demo", "GlowVisual.java"),
    [
      "package demo;",
      "class GlowVisual {",
      "  DeferredRegister<Block> blocks;",
      "  void client(FMLClientSetupEvent event) {",
      "    BlockEntityRenderers.register(DemoBlockEntities.GLOW.get(), GlowRenderer::new);",
      "    RenderSystem.enableBlend();",
      "    PostChain chain;",
      "  }",
      "}"
    ].join("\n")
  );
  await writeText(join(root, "assets", "demo", "blockstates", "block", "glow.json"), "{}\n");
  await writeText(join(root, "assets", "demo", "models", "block", "glow.json"), "{}\n");
  await writeText(
    join(root, "assets", "demo", "textures", "block", "glow.png"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])
  );

  return root;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string | Buffer): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
