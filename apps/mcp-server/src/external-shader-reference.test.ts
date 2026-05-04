import { describe, expect, it } from "vitest";

import { resolveExternalShaderReference } from "./external-shader-reference.js";

describe("resolveExternalShaderReference", () => {
  it("requires a user-provided key before remote shader lookup", async () => {
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
    ).resolves.toEqual({
      status: "credentials_required",
      source: "external_shader_reference",
      credentialEnvVar: "SHADERTOY_APP_KEY",
      setupUrl: "https://www.shadertoy.com/howto",
      summary:
        "External shader reference lookup requires SHADERTOY_APP_KEY. Local shader/resource evidence can still be used without it."
    });
    expect(called).toBe(false);
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
