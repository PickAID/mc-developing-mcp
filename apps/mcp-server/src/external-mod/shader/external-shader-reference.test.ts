import { describe, expect, it } from "vitest";

import { resolveExternalShaderReference } from "./external-shader-reference.js";

describe("resolveExternalShaderReference", () => {
  it("requests browser fallback when no key or browser provider is configured", async () => {
    let called = false;

    await expect(
      resolveExternalShaderReference({
        query: "machine glow",
        credentialProvider: () => undefined,
        fetch: async () => {
          called = true;
          return jsonResponse({});
        }
      })
    ).resolves.toMatchObject({
      status: "browser_fallback_required",
      source: "external_shader_reference",
      credentialEnvVar: "SHADERTOY_APP_KEY",
      setupUrl: "https://www.shadertoy.com/howto",
      fallbackTools: ["chrome_devtools", "playwright"],
      browserFallback: {
        query: "machine glow",
        targetUrl: "https://www.shadertoy.com/results?query=machine+glow",
        allowedTools: ["chrome_devtools", "playwright"],
        tokenPolicy: "compact_shader_formula_reference",
        extractionFields: ["title", "shaderId", "formulaTerms", "minecraftMapping"],
        maxResults: 4,
        sourcePolicy: {
          returnFullShaderSource: false,
          useFormulaSummaryOnly: true,
          requireMinecraftMapping: true
        },
        procedure: expect.arrayContaining([
          "Return compact summaries only; do not copy or persist full shader source."
        ])
      },
      summary:
        "External shader reference lookup can use SHADERTOY_APP_KEY. Without a key, use a local browser fallback through Chrome DevTools or Playwright and return only compact formula summaries."
    });
    expect(called).toBe(false);
  });

  it("uses a browser fallback provider when no ShaderToy key is configured", async () => {
    const result = await resolveExternalShaderReference({
      query: "soft bloom",
      credentialProvider: () => undefined,
      browserFallbackProvider: async (input) => {
        expect(input.browserFallback).toMatchObject({
          query: "soft bloom",
          targetUrl: "https://www.shadertoy.com/results?query=soft+bloom",
          allowedTools: ["chrome_devtools", "playwright"],
          tokenPolicy: "compact_shader_formula_reference",
          sourcePolicy: {
            returnFullShaderSource: false,
            useFormulaSummaryOnly: true,
            requireMinecraftMapping: true
          }
        });

        return Array.from({ length: 5 }, (_, index) => ({
          title: `Browser fallback bloom ${index}`,
          shaderId: `fallback${index}`,
          formulaTerms: [
            "palette",
            "uv",
            "noise",
            "sdf",
            "raymarch",
            "normal",
            "fbm",
            "falloff",
            "threshold",
            "blend",
            "mask",
            "rim",
            "source-must-be-trimmed"
          ],
          minecraftMapping: {
            uniforms: [
              "time_or_state",
              "resolution_or_bounds",
              "u2",
              "u3",
              "u4",
              "u5",
              "u6",
              "u7",
              "u8-must-be-trimmed"
            ],
            samplers: ["source_texture_or_atlas_sprite"],
            renderTargets: ["screen_or_post_chain_target"],
            lifecycle: ["resource_reload"]
          },
          source:
            "void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(1.0); }"
        })) as any;
      }
    });

    expect(result).toMatchObject({
      status: "ready",
      retrievalMethod: "browser_fallback",
      tokenPolicy: "compact_shader_formula_reference"
    });

    if (result.status !== "ready") {
      throw new Error("expected ready shader fallback result");
    }

    expect(result.summaries).toHaveLength(4);
    expect(result.summaries[0]).toMatchObject({
      title: "Browser fallback bloom 0",
      shaderId: "fallback0"
    });
    expect(result.summaries[0]).not.toHaveProperty("source");
    expect(result.summaries[0]?.formulaTerms).toHaveLength(12);
    expect(result.summaries[0]?.minecraftMapping.uniforms).toHaveLength(8);
  });

  it("keeps browser fallback summaries compact even with minimal provider data", async () => {
    const result = await resolveExternalShaderReference({
      query: "soft bloom",
      credentialProvider: () => undefined,
      browserFallbackProvider: async () => [
          {
            title: "Browser fallback bloom",
            shaderId: "fallback123",
            formulaTerms: ["palette", "uv"],
            minecraftMapping: {
              uniforms: ["time_or_state"],
              samplers: ["source_texture_or_atlas_sprite"],
              renderTargets: ["screen_or_post_chain_target"],
              lifecycle: ["resource_reload"]
            }
          }
        ]
    });

    expect(result).toMatchObject({
      status: "ready",
      retrievalMethod: "browser_fallback",
      tokenPolicy: "compact_shader_formula_reference",
      summaries: [
        {
          title: "Browser fallback bloom",
          shaderId: "fallback123"
        }
      ]
    });
  });

  it("maps remote shader summaries into Minecraft visual evidence roles", async () => {
    const requestedUrls: string[] = [];

    const result = await resolveExternalShaderReference({
      query: "glow raymarch",
      apiKey: "test-key",
      apiBaseUrl: "https://example.test",
      fetch: async (url) => {
        requestedUrls.push(url.toString());
        return jsonResponse({
          Results: [
            {
              id: "abc123",
              name: "Glow SDF Raymarch",
              description: "Uses noise, palette, normals, and uv space."
            }
          ]
        });
      }
    });

    expect(requestedUrls[0]).toContain("key=test-key");
    expect(result).toMatchObject({
      status: "ready",
      retrievalMethod: "shadertoy_api",
      tokenPolicy: "compact_shader_formula_reference",
      summaries: [
        {
          title: "Glow SDF Raymarch",
          shaderId: "abc123",
          formulaTerms: expect.arrayContaining(["noise", "sdf", "raymarch"]),
          minecraftMapping: {
            uniforms: ["time_or_state", "resolution_or_bounds"],
            samplers: ["source_texture_or_atlas_sprite"],
            renderTargets: ["screen_or_post_chain_target"],
            lifecycle: ["resource_reload", "fallback_when_unavailable"]
          }
        }
      ]
    });
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
