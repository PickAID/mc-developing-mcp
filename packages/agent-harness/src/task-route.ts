import type {
  AgentRuntimeHarnessSnapshot,
  AgentRuntimeTaskRoute,
  AgentRuntimeTaskRouteStep,
  AgentRuntimeToolName
} from "minecraft-developing-mcp-shared-types";

import { detectHarnessTaskIntent } from "./intent.js";

export function buildHarnessTaskRoute(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): AgentRuntimeTaskRoute {
  const intent = detectHarnessTaskIntent(snapshot, requestText);
  const vanillaSourceRequest = mentionsVanillaSourceRequest(requestText);
  const projectJavaSymbolRequest = mentionsProjectJavaSymbolRequest(
    snapshot,
    requestText
  );
  const modArchiveInventoryRequest = mentionsModArchiveInventoryRequest(requestText);

  switch (intent.id) {
    case "workspace_preparation":
      return {
        intent,
        reasons: [
          "workspace preparation should report available, missing, and confirm-required evidence routes before searching jar contents"
        ],
        steps: buildWorkspacePreparationSteps(snapshot),
        preferredTools: ["source.bundle", "workspace.analyze", "context.query"]
      };
    case "external_mod_resolution":
      return {
        intent,
        reasons: [
          "external mod acquisition should resolve API-backed candidates before docs"
        ],
        steps: ["external_mod_resolution", "docs_lookup"],
        preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
      };
    case "crash_triage":
      return {
        intent,
        reasons: [
          snapshot.facts.hasModArchives
            ? "crash triage should inspect log files before source, mod jars, or docs"
            : "crash triage should inspect log files before source or docs"
        ],
        steps: snapshot.facts.hasModArchives
          ? [
              "log_files",
              "mod_archive_content",
              "external_mod_resolution",
              "workspace_source",
              "docs_lookup"
            ]
          : [
              "log_files",
              "external_mod_resolution",
              "workspace_source",
              "docs_lookup"
            ],
        preferredTools: snapshot.facts.hasModArchives
          ? ["workspace.analyze", "context.query", "source.bundle"]
          : ["workspace.analyze", "context.query", "source.bundle"]
      };
    case "kubejs_authoring":
      return {
        intent,
        reasons: [
          "KubeJS authoring should inspect ProbeJS or d.ts context before docs"
        ],
        steps: withModArchiveContent(
          ["probejs_types", "docs_lookup"],
          snapshot.facts.hasModArchives
        ),
        preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
      };
    case "java_diagnostics":
      return {
        intent,
        reasons: [
          snapshot.facts.hasModArchives
            ? "Java diagnostics should inspect LSP diagnostics before source, mod jars, or docs"
            : "Java diagnostics should inspect LSP diagnostics before source or docs"
        ],
        steps: withModArchiveContent(
          ["java_diagnostics", "workspace_source", "docs_lookup"],
          snapshot.facts.hasModArchives
        ),
        preferredTools: ["workspace.analyze", "source.bundle", "context.query"]
      };
    case "client_visual_resources":
      return {
        intent,
        reasons: [
          "client visual and resource tasks should inspect workspace source, assets, renderer bindings, and local mod archive content before docs"
        ],
        steps: buildClientVisualResourceSteps(snapshot),
        preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
      };
    case "hotai_patch_workflow":
      return {
        intent,
        reasons: [
          "Hotai patch planning should prove the target class and available data-driven alternatives before bytecode patching"
        ],
        steps: buildHotaiPatchWorkflowSteps(snapshot),
        preferredTools: ["context.query", "source.bundle", "workspace.analyze"]
      };
    case "datapack_lookup":
      return {
        intent,
        reasons: ["datapack lookup should inspect datapack files before docs"],
        steps: withModArchiveContent(
          ["datapack_files", "docs_lookup"],
          snapshot.facts.hasModArchives
        ),
        preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
      };
    case "resource_pack_lookup":
      return {
        intent,
        reasons: [
          "resource-pack lookup should inspect assets evidence before docs"
        ],
        steps: withModArchiveContent(
          ["datapack_files", "docs_lookup"],
          snapshot.facts.hasModArchives
        ),
        preferredTools: ["source.bundle", "context.query", "workspace.analyze"]
      };
    case "workspace_default":
      return {
        intent,
        reasons: [
          ...(vanillaSourceRequest
            ? [
                "request targets net.minecraft vanilla source and should stay on source-side evidence before docs"
              ]
            : []),
          ...(projectJavaSymbolRequest
            ? [
                "request targets a Java project symbol and should stay on source-side evidence before docs"
              ]
            : []),
          ...(modArchiveInventoryRequest
            ? ["request explicitly asks for mod archive inventory"]
            : []),
          "fall back to the default workspace route when no specialized intent is detected"
        ],
        steps: projectJavaSymbolRequest
          ? buildProjectJavaSymbolSteps(snapshot)
          : modArchiveInventoryRequest
            ? withExplicitModArchiveContent(snapshot.routePlan.steps)
            : [...snapshot.routePlan.steps],
        preferredTools: modArchiveInventoryRequest
          ? ["context.query", "workspace.analyze"]
          : deriveDefaultTools(snapshot)
      };
  }
}

function buildHotaiPatchWorkflowSteps(
  snapshot: AgentRuntimeHarnessSnapshot
): AgentRuntimeTaskRouteStep[] {
  const steps: AgentRuntimeTaskRouteStep[] = [];

  if (snapshot.facts.hasJavaSource || snapshot.facts.hasGradle) {
    steps.push("workspace_source");
  }
  if (snapshot.facts.hasModArchives) {
    steps.push("mod_archive_content");
  }
  if (snapshot.facts.hasProbeJS || snapshot.facts.hasKubeJS) {
    steps.push("probejs_types");
  }
  if (
    snapshot.facts.hasDatapack ||
    snapshot.facts.hasResourcePack ||
    snapshot.facts.datapackRootCount > 0 ||
    snapshot.facts.resourcePackRootCount > 0
  ) {
    steps.push("datapack_files");
  }

  steps.push("docs_lookup");
  return [...new Set(steps)];
}

function buildWorkspacePreparationSteps(
  snapshot: AgentRuntimeHarnessSnapshot
): AgentRuntimeTaskRouteStep[] {
  const steps: AgentRuntimeTaskRouteStep[] = ["source_acquisition_plan"];

  if (snapshot.facts.hasProbeJS || snapshot.facts.hasKubeJS) {
    steps.push("probejs_types");
  }

  if (snapshot.facts.hasGradle || snapshot.facts.hasJavaSource) {
    steps.push("workspace_source", "java_diagnostics");
  }

  if (
    snapshot.facts.hasDatapack ||
    snapshot.facts.hasResourcePack ||
    snapshot.facts.datapackRootCount > 0 ||
    snapshot.facts.resourcePackRootCount > 0
  ) {
    steps.push("datapack_files");
  }

  if (snapshot.facts.hasModArchives) {
    steps.push("mod_archive_content", "external_mod_resolution");
  }

  steps.push("docs_lookup");
  return [...new Set(steps)];
}

function withModArchiveContent(
  steps: AgentRuntimeTaskRouteStep[],
  enabled: boolean
): AgentRuntimeTaskRouteStep[] {
  if (!enabled || steps.includes("mod_archive_content")) {
    return steps;
  }

  const docsIndex = steps.indexOf("docs_lookup");
  if (docsIndex < 0) {
    return [...steps, "mod_archive_content"];
  }

  return [
    ...steps.slice(0, docsIndex),
    "mod_archive_content",
    ...steps.slice(docsIndex)
  ];
}

function withExplicitModArchiveContent(
  steps: AgentRuntimeTaskRouteStep[]
): AgentRuntimeTaskRouteStep[] {
  if (steps.includes("mod_archive_content")) {
    return steps;
  }

  const docsIndex = steps.indexOf("docs_lookup");
  if (docsIndex >= 0) {
    return [
      ...steps.slice(0, docsIndex),
      "mod_archive_content",
      ...steps.slice(docsIndex)
    ];
  }

  return steps.length === 0
    ? ["mod_archive_content", "docs_lookup"]
    : [...steps, "mod_archive_content"];
}

function buildClientVisualResourceSteps(
  snapshot: AgentRuntimeHarnessSnapshot
): AgentRuntimeTaskRouteStep[] {
  const steps: AgentRuntimeTaskRouteStep[] = [];

  if (snapshot.facts.hasProbeJS || snapshot.facts.hasKubeJS) {
    steps.push("probejs_types");
  }

  if (snapshot.facts.hasJavaSource || snapshot.facts.hasGradle) {
    steps.push("workspace_source");
  }

  if (
    snapshot.facts.hasDatapack ||
    snapshot.facts.datapackRootCount > 0 ||
    snapshot.facts.hasResourcePack ||
    snapshot.facts.resourcePackRootCount > 0 ||
    snapshot.facts.hasJavaSource ||
    snapshot.facts.hasGradle ||
    snapshot.facts.hasKubeJS ||
    snapshot.facts.hasProbeJS
  ) {
    steps.push("datapack_files");
  }

  if (snapshot.facts.hasModArchives) {
    steps.push("mod_archive_content");
  }

  steps.push("docs_lookup");
  return steps;
}

export function buildHarnessTaskRouteFromSnapshot(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): AgentRuntimeTaskRoute {
  return buildHarnessTaskRoute(snapshot, requestText);
}

function deriveDefaultTools(
  snapshot: AgentRuntimeHarnessSnapshot
): AgentRuntimeToolName[] {
  switch (snapshot.routePlan.scenario) {
    case "java-mod-workspace":
    case "modpack-workspace":
    case "datapack-workspace":
      return ["source.bundle", "context.query", "workspace.analyze"];
    case "kubejs-workspace":
      return ["context.query", "source.bundle", "workspace.analyze"];
    case "unknown-workspace":
      return ["workspace.analyze", "context.query"];
  }
}

function mentionsVanillaSourceRequest(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  return /\bnet\.minecraft(?:\.[A-Za-z_][A-Za-z0-9_]*)+\b/.test(requestText);
}

function mentionsProjectJavaSymbolRequest(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): boolean {
  if (!requestText || !(snapshot.facts.hasJavaSource || snapshot.facts.hasGradle)) {
    return false;
  }
  if (mentionsVanillaSourceRequest(requestText)) {
    return false;
  }

  return (
    /\b(?:[a-z_][A-Za-z0-9_]*\.){2,}[A-Z][A-Za-z0-9_]*\b/.test(
      requestText
    ) ||
    mentionsSimpleJavaSourceRequest(requestText) ||
    /\b(?:inspect|open|find|where|implementation|implemented|class|method|symbol|查看|查找|实现|类|方法)\b[\s\S]{0,80}\b[A-Z][A-Za-z0-9_]*(?:Item|Block|Entity|Screen|Renderer|Menu|Model|Registry|Handler|Manager|Event|Mixin|Compat)\b/u.test(
      requestText
    )
  );
}

function mentionsSimpleJavaSourceRequest(requestText: string): boolean {
  return (
    /\b(?:inspect|open|find|read|show|查看|查找|读取|打开)\b/i.test(
      requestText
    ) &&
    /\b(?:source|sources|java|gradle cache|gradle|源码|源代码)\b/i.test(
      requestText
    ) &&
    /\b[A-Z_$][A-Za-z0-9_$]*(?:\.java)?\b/.test(requestText)
  );
}

function buildProjectJavaSymbolSteps(
  snapshot: AgentRuntimeHarnessSnapshot
): AgentRuntimeTaskRouteStep[] {
  return snapshot.facts.hasModArchives
    ? ["workspace_source", "mod_archive_content", "docs_lookup"]
    : ["workspace_source", "docs_lookup"];
}

function mentionsModArchiveInventoryRequest(requestText?: string): boolean {
  if (!requestText) {
    return false;
  }

  const normalizedText = requestText.toLowerCase();
  return (
    /\b(inventory|index|summary|清单|索引|概览)\b/i.test(requestText) &&
    /\b(mod|mods|jar|jars|jarjar|archive|archives)\b/.test(normalizedText)
  );
}
