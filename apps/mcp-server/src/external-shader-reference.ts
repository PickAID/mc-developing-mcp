export interface ExternalShaderReferenceInput {
  query: string;
  apiKey?: string;
  credentialProvider?: () => string | undefined;
  allowAmbientEnv?: boolean;
  fetch?: typeof fetch;
  apiBaseUrl?: string;
}

export type ExternalShaderReferenceResult =
  | {
      status: "credentials_required";
      source: "external_shader_reference";
      credentialEnvVar: "SHADERTOY_APP_KEY";
      setupUrl: "https://www.shadertoy.com/howto";
      summary: string;
    }
  | {
      status: "ready";
      source: "external_shader_reference";
      tokenPolicy: "compact_shader_formula_reference";
      summaries: ExternalShaderFormulaSummary[];
    };

export interface ExternalShaderFormulaSummary {
  title: string;
  shaderId?: string;
  formulaTerms: string[];
  minecraftMapping: {
    uniforms: string[];
    samplers: string[];
    renderTargets: string[];
    lifecycle: string[];
  };
}

const SHADERTOY_APP_KEY_ENV_VAR = "SHADERTOY_APP_KEY";
const SHADERTOY_SETUP_URL = "https://www.shadertoy.com/howto";
const SHADERTOY_API_BASE_URL = "https://www.shadertoy.com";

export async function resolveExternalShaderReference(
  input: ExternalShaderReferenceInput
): Promise<ExternalShaderReferenceResult> {
  const apiKey =
    input.apiKey ??
    input.credentialProvider?.() ??
    (input.allowAmbientEnv === false
      ? undefined
      : process.env[SHADERTOY_APP_KEY_ENV_VAR]);

  if (!apiKey) {
    return {
      status: "credentials_required",
      source: "external_shader_reference",
      credentialEnvVar: SHADERTOY_APP_KEY_ENV_VAR,
      setupUrl: SHADERTOY_SETUP_URL,
      summary:
        "External shader reference lookup requires SHADERTOY_APP_KEY. Local shader/resource evidence can still be used without it."
    };
  }

  const response = await fetchShaderSearch({
    query: input.query,
    apiKey,
    fetchImpl: input.fetch ?? fetch,
    apiBaseUrl: input.apiBaseUrl ?? SHADERTOY_API_BASE_URL
  });

  return {
    status: "ready",
    source: "external_shader_reference",
    tokenPolicy: "compact_shader_formula_reference",
    summaries: response.Results.slice(0, 4).map((entry) => ({
      title: entry.name,
      shaderId: entry.id,
      formulaTerms: extractFormulaTerms([entry.name, entry.description ?? ""]),
      minecraftMapping: {
        uniforms: ["time_or_state", "resolution_or_bounds"],
        samplers: ["source_texture_or_atlas_sprite"],
        renderTargets: ["screen_or_post_chain_target"],
        lifecycle: ["resource_reload", "fallback_when_unavailable"]
      }
    }))
  };
}

async function fetchShaderSearch(input: {
  query: string;
  apiKey: string;
  fetchImpl: typeof fetch;
  apiBaseUrl: string;
}): Promise<{ Results: Array<{ id?: string; name: string; description?: string }> }> {
  const url = new URL("/api/v1/shaders/query", input.apiBaseUrl);
  url.searchParams.set("key", input.apiKey);
  url.searchParams.set("q", input.query);

  const response = await input.fetchImpl(url);
  if (!response.ok) {
    return { Results: [] };
  }

  return (await response.json()) as {
    Results: Array<{ id?: string; name: string; description?: string }>;
  };
}

function extractFormulaTerms(parts: string[]): string[] {
  const text = parts.join(" ").toLowerCase();
  const termPatterns: Array<[string, RegExp]> = [
    ["noise", /\bnoise\b/],
    ["sdf", /\bsdf|distance field\b/],
    ["raymarch", /\braymarch|ray march\b/],
    ["palette", /\bpalette\b/],
    ["uv", /\buv\b/],
    ["normal", /\bnormal\b/]
  ];

  return termPatterns.flatMap(([term, pattern]) =>
    pattern.test(text) ? [term] : []
  );
}
