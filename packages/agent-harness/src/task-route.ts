import type {
  AgentRuntimeHarnessSnapshot,
  AgentRuntimeTaskRoute,
  AgentRuntimeTaskRouteStep,
  AgentRuntimeToolName
} from "@mcpskill/shared-types";

import { detectHarnessTaskIntent } from "./intent.js";

export function buildHarnessTaskRoute(
  snapshot: AgentRuntimeHarnessSnapshot,
  requestText?: string
): AgentRuntimeTaskRoute {
  const intent = detectHarnessTaskIntent(snapshot, requestText);
  const vanillaSourceRequest = mentionsVanillaSourceRequest(requestText);
  const modArchiveInventoryRequest = mentionsModArchiveInventoryRequest(requestText);

  switch (intent.id) {
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
          ...(modArchiveInventoryRequest
            ? ["request explicitly asks for mod archive inventory"]
            : []),
          "fall back to the default workspace route when no specialized intent is detected"
        ],
        steps: modArchiveInventoryRequest
          ? withExplicitModArchiveContent(snapshot.routePlan.steps)
          : [...snapshot.routePlan.steps],
        preferredTools: modArchiveInventoryRequest
          ? ["context.query", "workspace.analyze"]
          : deriveDefaultTools(snapshot)
      };
  }
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
