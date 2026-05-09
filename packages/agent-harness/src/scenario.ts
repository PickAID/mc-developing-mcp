import type {
  WorkspaceBootstrapContext,
  WorkspaceDescriptor
} from "minecraft-developing-mcp-shared-types";

export type HarnessWorkspaceScenario =
  | "java-mod-workspace"
  | "kubejs-workspace"
  | "datapack-workspace"
  | "modpack-workspace"
  | "unknown-workspace";

export type HarnessRoutingScenario =
  | "project_symbol"
  | "kubejs_script"
  | "datapack_lookup";

export type HarnessScenarioDetection =
  | {
      scenario: "java-mod-workspace";
      reasons: string[];
      defaultRoutingScenario: "project_symbol";
    }
  | {
      scenario: "kubejs-workspace";
      reasons: string[];
      defaultRoutingScenario: "kubejs_script";
    }
  | {
      scenario: "datapack-workspace";
      reasons: string[];
      defaultRoutingScenario: "datapack_lookup";
    }
  | {
      scenario: "modpack-workspace";
      reasons: string[];
      defaultRoutingScenario: "project_symbol";
    }
  | {
      scenario: "unknown-workspace";
      reasons: string[];
    };

export function detectHarnessScenario(
  workspaceContext?: WorkspaceBootstrapContext
): HarnessScenarioDetection {
  if (!workspaceContext) {
    return {
      scenario: "unknown-workspace",
      reasons: ["workspace context is unavailable"]
    };
  }

  return detectFromDescriptor(workspaceContext.descriptor);
}

export function detectHarnessScenarioFromBootstrap(
  input: { workspaceContext?: WorkspaceBootstrapContext }
): HarnessScenarioDetection {
  return detectHarnessScenario(input.workspaceContext);
}

function detectFromDescriptor(
  descriptor: WorkspaceDescriptor
): HarnessScenarioDetection {
  if (descriptor.kind === "modpack") {
    return {
      scenario: "modpack-workspace",
      reasons: ["workspace descriptor reports a modpack workspace"],
      defaultRoutingScenario: "project_symbol"
    };
  }

  if (isKubejsWorkspace(descriptor)) {
    return {
      scenario: "kubejs-workspace",
      reasons: ["workspace descriptor reports KubeJS or ProbeJS support"],
      defaultRoutingScenario: "kubejs_script"
    };
  }

  if (descriptor.kind === "java-mod") {
    return {
      scenario: "java-mod-workspace",
      reasons: ["workspace descriptor reports a Java mod workspace"],
      defaultRoutingScenario: "project_symbol"
    };
  }

  if (descriptor.hasDatapack) {
    return {
      scenario: "datapack-workspace",
      reasons: ["workspace descriptor reports datapack content"],
      defaultRoutingScenario: "datapack_lookup"
    };
  }

  if (isJavaModWorkspace(descriptor)) {
    return {
      scenario: "java-mod-workspace",
      reasons: ["workspace descriptor reports a Java mod workspace"],
      defaultRoutingScenario: "project_symbol"
    };
  }

  return {
    scenario: "unknown-workspace",
    reasons: ["workspace descriptor does not match a known harness scenario"]
  };
}

function isKubejsWorkspace(descriptor: WorkspaceDescriptor): boolean {
  return (
    descriptor.kind === "kubejs" || descriptor.hasKubeJS || descriptor.hasProbeJS
  );
}

function isJavaModWorkspace(descriptor: WorkspaceDescriptor): boolean {
  return (
    descriptor.kind === "java-mod" ||
    descriptor.hasGradle ||
    descriptor.hasJavaSource
  );
}
