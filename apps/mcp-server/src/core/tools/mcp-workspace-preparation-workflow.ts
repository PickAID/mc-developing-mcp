export function buildWorkspacePreparationWorkflow(
  payload: Record<string, unknown>,
  capabilityGuidance: Record<string, unknown> | undefined
) {
  const capabilityMap = isRecord(capabilityGuidance?.capabilityMap)
    ? capabilityGuidance.capabilityMap
    : undefined;
  const routeCapabilities = arrayOfRecords(capabilityMap?.routeCapabilities);
  const routes = arrayOfRecords(payload.routes);
  const workItems = arrayOfRecords(payload.workItems);
  const sourceIndexPreview = isRecord(payload.sourceIndexPreview)
    ? payload.sourceIndexPreview
    : undefined;

  return {
    model: "catalog_inspect_execute",
    catalog: {
      routeCount: routes.length,
      recommendedRouteOrder: arrayOfStrings(
        capabilityMap?.recommendedRouteOrder
      ),
      readyOrigins: routeCapabilities
        .filter((route) => route.status === "ready")
        .map((route) => String(route.origin)),
      blockedOrigins: routeCapabilities
        .filter((route) => route.status !== "ready")
        .map((route) => ({
          origin: String(route.origin),
          status: String(route.status),
          nextAction: optionalString(route.nextAction)
        }))
    },
    inspect: buildInspectTargets(routeCapabilities, workItems, sourceIndexPreview),
    execute: buildExecutableNextActions(routeCapabilities, sourceIndexPreview)
  };
}

function buildInspectTargets(
  routeCapabilities: Array<Record<string, unknown>>,
  workItems: Array<Record<string, unknown>>,
  sourceIndexPreview: Record<string, unknown> | undefined
) {
  const targets = routeCapabilities.map((route) => {
    const origin = String(route.origin);
    const kinds = workItems
      .filter((item) => workItemBelongsToOrigin(item, origin))
      .map((item) => String(item.kind));

    return {
      origin,
      detailLocation: "executions[].payload.workItemExecutions",
      workItemKinds: [...new Set(kinds)],
      useFor: arrayOfStrings(route.useFor),
      nextAction: optionalString(route.nextAction)
    };
  });

  if (sourceIndexPreview) {
    targets.push({
      origin: "runtime_cache",
      detailLocation: "executions[].payload.sourceIndexPreview",
      workItemKinds: [],
      useFor: ["cached source index preview"],
      nextAction: undefined
    });
  }

  return targets;
}

function buildExecutableNextActions(
  routeCapabilities: Array<Record<string, unknown>>,
  sourceIndexPreview: Record<string, unknown> | undefined
) {
  const executableRouteActions = routeCapabilities
    .flatMap((route) => routeActions(route))
    .filter((action) => action !== undefined);
  const sourceIndexAction = sourceIndexPreview
    ? {
        id: "inspect_source_index_preview",
        origin: "runtime_cache",
        safety: "read_only",
        reason: "A cached source index preview is already available.",
        inputPatch: { preparationRoutes: ["runtime_cache"] }
      }
    : undefined;

  return [
    ...executableRouteActions,
    ...(sourceIndexAction ? [sourceIndexAction] : [])
  ];
}

function routeActions(route: Record<string, unknown>) {
  const primaryAction = routeAction(route);
  const backgroundAction = backgroundPrewarmAction(route);

  return [
    ...(primaryAction ? [primaryAction] : []),
    ...(backgroundAction ? [backgroundAction] : [])
  ];
}

function routeAction(route: Record<string, unknown>) {
  const origin = String(route.origin);
  const nextAction = optionalString(route.nextAction);

  if (origin === "modrinth" || origin === "curseforge" || origin === "github") {
    return {
      id: `enable_${origin}_metadata`,
      origin,
      safety: origin === "curseforge" ? "requires_credentials" : "network_metadata",
      reason:
        nextAction ??
        `Remote ${origin} metadata requires explicit policy before execution.`,
      inputPatch: {
        preparationRoutes: [origin],
        preparationPolicy: { remoteMetadataPolicy: "enabled" }
      }
    };
  }
  if (origin === "official") {
    return {
      id: "confirm_vanilla_generation",
      origin,
      safety: "requires_user_confirmation",
      reason: nextAction ?? "Official source/assets generation is local but consent-gated.",
      inputPatch: { preparationRoutes: ["official"] }
    };
  }
  if (nextAction) {
    return {
      id: `prepare_${origin}`,
      origin,
      safety: "local_read_only",
      reason: nextAction,
      inputPatch: { preparationRoutes: [origin] }
    };
  }
  if (route.status === "ready" && isLocalInspectableOrigin(origin)) {
    return {
      id: `inspect_${origin}_evidence`,
      origin,
      safety: "read_only",
      reason: "Route is ready; inspect compact execution payload details before falling back to docs or guessing.",
      inputPatch: { preparationRoutes: [origin] }
    };
  }

  return undefined;
}

function backgroundPrewarmAction(route: Record<string, unknown>) {
  const origin = String(route.origin);

  if (origin !== "local_jar" || route.status !== "ready") {
    return undefined;
  }

  return {
    id: "prewarm_local_jar_entry_index",
    origin,
    safety: "local_background_cache",
    reason:
      "Local mod jars are available; run this during idle time to build the private SQLite entry index for faster crash triage and class/resource owner lookup.",
    inputPatch: {
      preparationRoutes: ["local_jar"],
      preparationPolicy: { localJarMode: "prewarm_entry_index" }
    }
  };
}

function isLocalInspectableOrigin(origin: string): boolean {
  return (
    origin === "workspace_gradle" ||
    origin === "workspace_probejs" ||
    origin === "runtime_cache" ||
    origin === "local_jar" ||
    origin === "user_jar"
  );
}

function workItemBelongsToOrigin(
  workItem: Record<string, unknown>,
  origin: string
): boolean {
  if (origin === "workspace_gradle") {
    return workItem.kind === "workspace_gradle_dependencies";
  }
  if (origin === "workspace_probejs") {
    return workItem.kind === "workspace_probejs_types";
  }
  if (origin === "local_jar" || origin === "user_jar") {
    return workItem.kind === "jar_index";
  }
  if (origin === "official") {
    return workItem.kind === "vanilla_generation";
  }
  if (origin === "modrinth" || origin === "curseforge" || origin === "github") {
    return workItem.kind === "remote_metadata" && workItem.source === origin;
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
