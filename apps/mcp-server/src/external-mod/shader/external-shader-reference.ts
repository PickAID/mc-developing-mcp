export interface ExternalShaderReferenceInput {
  query: string;
  apiKey?: string;
  credentialProvider?: () => string | undefined;
  browserFallbackProvider?: (
    input: ExternalShaderBrowserFallbackInput
  ) => Promise<ExternalShaderFormulaSummary[]>;
  allowAmbientEnv?: boolean;
  fetch?: typeof fetch;
  apiBaseUrl?: string;
}

export type ExternalShaderReferenceResult =
  | {
      status: "browser_fallback_required";
      source: "external_shader_reference";
      credentialEnvVar: "SHADERTOY_APP_KEY";
      setupUrl: "https://www.shadertoy.com/howto";
      fallbackTools: ["chrome_devtools", "playwright"];
      browserFallback: ExternalShaderBrowserFallbackPlan;
      summary: string;
    }
  | {
      status: "ready";
      source: "external_shader_reference";
      tokenPolicy: "compact_shader_formula_reference";
      retrievalMethod: "shadertoy_api" | "browser_fallback";
      summaries: ExternalShaderFormulaSummary[];
    };

export interface ExternalShaderBrowserFallbackInput {
  browserFallback: ExternalShaderBrowserFallbackPlan;
}

export interface ExternalShaderBrowserFallbackPlan {
  query: string;
  targetUrl: string;
  allowedTools: ["chrome_devtools", "playwright"];
  tokenPolicy: "compact_shader_formula_reference";
  extractionFields: ["title", "shaderId", "formulaTerms", "minecraftMapping"];
  maxResults: 4;
  sourcePolicy: {
    returnFullShaderSource: false;
    useFormulaSummaryOnly: true;
    requireMinecraftMapping: true;
  };
  procedure: string[];
}

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
  const browserFallback = buildBrowserFallbackPlan(input.query);
  const apiKey =
    input.apiKey ??
    input.credentialProvider?.() ??
    (input.allowAmbientEnv === false
      ? undefined
      : process.env[SHADERTOY_APP_KEY_ENV_VAR]);

  if (!apiKey && input.browserFallbackProvider) {
    const summaries = await input.browserFallbackProvider({ browserFallback });

    return {
      status: "ready",
      source: "external_shader_reference",
      tokenPolicy: "compact_shader_formula_reference",
      retrievalMethod: "browser_fallback",
      summaries: sanitizeFormulaSummaries(summaries, browserFallback.maxResults)
    };
  }

  if (!apiKey) {
    return {
      status: "browser_fallback_required",
      source: "external_shader_reference",
      credentialEnvVar: SHADERTOY_APP_KEY_ENV_VAR,
      setupUrl: SHADERTOY_SETUP_URL,
      fallbackTools: ["chrome_devtools", "playwright"],
      browserFallback,
      summary:
        "External shader reference lookup can use SHADERTOY_APP_KEY. Without a key, use a local browser fallback through Chrome DevTools or Playwright and return only compact formula summaries."
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
    retrievalMethod: "shadertoy_api",
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

function buildBrowserFallbackPlan(query: string): ExternalShaderBrowserFallbackPlan {
  const targetUrl = new URL("/results", SHADERTOY_API_BASE_URL);
  targetUrl.searchParams.set("query", query);

  return {
    query,
    targetUrl: targetUrl.toString(),
    allowedTools: ["chrome_devtools", "playwright"],
    tokenPolicy: "compact_shader_formula_reference",
    extractionFields: ["title", "shaderId", "formulaTerms", "minecraftMapping"],
    maxResults: 4,
    sourcePolicy: {
      returnFullShaderSource: false,
      useFormulaSummaryOnly: true,
      requireMinecraftMapping: true
    },
    procedure: [
      "Open targetUrl with a local browser session.",
      "Search or inspect visible ShaderToy result cards for titles and ids.",
      "Open only the minimum result pages needed to infer compact formula terms.",
      "Map formulas to Minecraft uniforms, samplers, render targets, and reload lifecycle.",
      "Return compact summaries only; do not copy or persist full shader source."
    ]
  };
}

function sanitizeFormulaSummaries(
  summaries: ExternalShaderFormulaSummary[],
  maxResults: number
): ExternalShaderFormulaSummary[] {
  return summaries.slice(0, maxResults).map((summary) => ({
    title: summary.title,
    shaderId: summary.shaderId,
    formulaTerms: summary.formulaTerms.slice(0, 12),
    minecraftMapping: {
      uniforms: summary.minecraftMapping.uniforms.slice(0, 8),
      samplers: summary.minecraftMapping.samplers.slice(0, 8),
      renderTargets: summary.minecraftMapping.renderTargets.slice(0, 8),
      lifecycle: summary.minecraftMapping.lifecycle.slice(0, 8)
    }
  }));
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
