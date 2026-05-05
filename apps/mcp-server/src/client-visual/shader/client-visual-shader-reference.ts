import {
  resolveExternalShaderReference,
  type ExternalShaderReferenceInput,
  type ExternalShaderReferenceResult
} from "../../external-mod/shader/external-shader-reference.js";

export interface ClientVisualExternalShaderReferenceOptions
  extends Omit<ExternalShaderReferenceInput, "query"> {
  enabled?: boolean;
  query?: string;
}

export async function resolveClientVisualExternalShaderReference(input: {
  requestText: string;
  options?: ClientVisualExternalShaderReferenceOptions;
}): Promise<ExternalShaderReferenceResult | undefined> {
  if (input.options?.enabled !== true) {
    return undefined;
  }

  return resolveExternalShaderReference({
    ...input.options,
    allowAmbientEnv: input.options.allowAmbientEnv ?? false,
    query: input.options.query ?? buildShaderReferenceQuery(input.requestText)
  });
}

function buildShaderReferenceQuery(requestText: string): string {
  const compact = requestText
    .replace(/\b[a-z0-9_.-]+:[a-z0-9_.\-\/]+\b/gi, " ")
    .replace(/\b(?:data|assets)\/[A-Za-z0-9_.-]+\/[^\s'"`<>]+/g, " ")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

  return compact.slice(0, 80) || "minecraft client visual shader";
}
