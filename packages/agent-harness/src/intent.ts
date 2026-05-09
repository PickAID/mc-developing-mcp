import type {
  AgentRuntimeHarnessSnapshot,
  AgentRuntimeTaskIntent
} from "minecraft-developing-mcp-shared-types";

import {
  CLIENT_VISUAL_RESOURCE_KEYWORDS,
  CRASH_KEYWORDS,
  DATAPACK_KEYWORDS,
  EXTERNAL_MOD_KEYWORDS,
  hasClientVisualResourceEvidence,
  hasHotaiPatchWorkflowEvidence,
  HOTAI_PATCH_WORKFLOW_KEYWORDS,
  JAVA_DIAGNOSTIC_KEYWORDS,
  KUBEJS_KEYWORDS,
  matchesAny,
  matchesWorkspacePreparationIntent,
  mentionsAssetsPath,
  mentionsClientVisualResourceContext,
  mentionsDataPath,
  mentionsVanillaGeneratedDatapackRequest,
  mentionsVanillaGeneratedResourcePackRequest,
  mentionsVanillaGenerationTargetRequest,
  RESOURCE_PACK_KEYWORDS
} from "./intent-matchers.js";

export function detectHarnessTaskIntent(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): AgentRuntimeTaskIntent {
  if (!requestText || requestText.trim() === "") {
    return {
      id: "workspace_default",
      confidence: "low",
      reasons: ["request text is unavailable"]
    };
  }

  const normalized = requestText.toLowerCase();
  const datapackRequest =
    matchesAny(normalized, DATAPACK_KEYWORDS) || mentionsDataPath(normalized);
  const resourcePackRequest =
    matchesAny(normalized, RESOURCE_PACK_KEYWORDS) ||
    mentionsAssetsPath(normalized);
  const clientVisualResourceRequest =
    matchesAny(normalized, CLIENT_VISUAL_RESOURCE_KEYWORDS) ||
    (resourcePackRequest && mentionsClientVisualResourceContext(normalized));
  const vanillaGeneratedDatapackRequest =
    datapackRequest && mentionsVanillaGeneratedDatapackRequest(normalized);
  const vanillaGeneratedResourcePackRequest =
    resourcePackRequest && mentionsVanillaGeneratedResourcePackRequest(normalized);
  const vanillaGenerationTargetRequest =
    mentionsVanillaGenerationTargetRequest(normalized);

  if (
    matchesAny(normalized, HOTAI_PATCH_WORKFLOW_KEYWORDS) &&
    hasHotaiPatchWorkflowEvidence(snapshot)
  ) {
    return {
      id: "hotai_patch_workflow",
      confidence: "high",
      reasons: [
        "request text mentions Hotai, badiff, bytecode patch, class patch, or Hotai patch layout keywords",
        "workspace snapshot exposes patch target evidence routes"
      ]
    };
  }

  if (matchesWorkspacePreparationIntent(normalized, snapshot)) {
    return {
      id: "workspace_preparation",
      confidence: "high",
      reasons: [
        "request text asks to prepare, initialize, cache, bundle, or index workspace evidence",
        "workspace snapshot exposes local evidence routes that can be prepared progressively"
      ]
    };
  }

  if (matchesAny(normalized, CRASH_KEYWORDS) && snapshot.facts.logPathCount > 0) {
    return {
      id: "crash_triage",
      confidence: "high",
      reasons: [
        "request text mentions crash or log-triage keywords",
        "workspace snapshot exposes log files for crash triage"
      ]
    };
  }

  if (
    clientVisualResourceRequest &&
    !vanillaGeneratedResourcePackRequest &&
    hasClientVisualResourceEvidence(snapshot)
  ) {
    return {
      id: "client_visual_resources",
      confidence: "high",
      reasons: [
        "request text mentions client visual, rendering, model, blockstate, asset, or registry wiring keywords",
        "workspace snapshot exposes source, asset/datapack, or mod archive evidence"
      ]
    };
  }

  if (
    matchesAny(normalized, JAVA_DIAGNOSTIC_KEYWORDS) &&
    (snapshot.facts.hasJavaSource || snapshot.facts.hasGradle)
  ) {
    return {
      id: "java_diagnostics",
      confidence: "high",
      reasons: [
        "request text mentions Java compile or diagnostic keywords",
        "workspace snapshot exposes Java source or Gradle signals"
      ]
    };
  }

  if (vanillaGenerationTargetRequest) {
    return {
      id: "datapack_lookup",
      confidence: "high",
      reasons: [
        "request text asks for official vanilla local generation targets",
        "vanilla generation targets are exposed through source.bundle without downloading artifacts"
      ]
    };
  }

  if (matchesAny(normalized, EXTERNAL_MOD_KEYWORDS)) {
    return {
      id: "external_mod_resolution",
      confidence: "high",
      reasons: [
        "request text mentions external mod acquisition or Maven coordinate keywords"
      ]
    };
  }

  if (
    matchesAny(normalized, KUBEJS_KEYWORDS) &&
    (snapshot.facts.hasKubeJS || snapshot.facts.hasProbeJS)
  ) {
    return {
      id: "kubejs_authoring",
      confidence: "high",
      reasons: [
        "request text mentions KubeJS scripting keywords",
        "workspace snapshot exposes KubeJS or ProbeJS signals"
      ]
    };
  }

  if (
    resourcePackRequest &&
    (
      snapshot.facts.hasDatapack ||
      snapshot.facts.datapackRootCount > 0 ||
      vanillaGeneratedResourcePackRequest
    )
  ) {
    return {
      id: "resource_pack_lookup",
      confidence: "high",
      reasons: vanillaGeneratedResourcePackRequest
        ? [
            "request text mentions vanilla resource-pack asset evidence",
            "vanilla assets content can be resolved from generated official packages"
          ]
        : [
            "request text mentions resource-pack asset keywords or assets path",
            "workspace snapshot exposes resource-pack asset content"
          ]
    };
  }

  if (
    datapackRequest &&
    (
      snapshot.facts.hasDatapack ||
      snapshot.facts.datapackRootCount > 0 ||
      vanillaGeneratedDatapackRequest
    )
  ) {
    return {
      id: "datapack_lookup",
      confidence: "high",
      reasons: vanillaGeneratedDatapackRequest
        ? [
            "request text mentions vanilla datapack evidence",
            "vanilla data content can be resolved from generated official packages"
          ]
        : [
            "request text mentions datapack or worldgen keywords",
            "workspace snapshot exposes datapack content"
          ]
    };
  }

  return {
    id: "workspace_default",
    confidence: "low",
    reasons: ["request text does not match a specialized harness intent"]
  };
}

export function detectHarnessTaskIntentFromSnapshot(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): AgentRuntimeTaskIntent {
  return detectHarnessTaskIntent(snapshot, requestText);
}
