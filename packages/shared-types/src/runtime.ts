import type {
  CurrentRuntime,
  RuntimeConfidence,
  WorkspaceDescriptor,
  WorkspaceKind
} from "./workspace.js";

export type RuntimeArtifactId = "jdk" | "jdtls" | "gradle-support";

export interface RuntimeArtifactRequest {
  id: RuntimeArtifactId;
  version: string;
}

export interface ManagedRuntimePolicy {
  mode: "managed-first" | "system-first";
  allowSystemFallback: boolean;
  runtimeRoot: string;
  requiredArtifacts: RuntimeArtifactRequest[];
}

export interface ManagedRuntimeLayout {
  root: string;
  downloads: string;
  installs: string;
  locks: string;
}

export interface WorkspaceBootstrapInput {
  workspaceRoot: string;
  prismRoot?: string;
}

export interface WorkspaceBootstrapContext extends WorkspaceBootstrapInput {
  detectorPackage: "@mcpskill/workspace-detector";
  descriptor: WorkspaceDescriptor;
}

export type AgentRuntimeRouteStep =
  | "workspace_source"
  | "probejs_types"
  | "external_mod_resolution"
  | "mod_archive_content"
  | "datapack_files"
  | "docs_lookup";

export type AgentRuntimeTaskRouteStep =
  | AgentRuntimeRouteStep
  | "log_files"
  | "java_diagnostics";

export type AgentRuntimeDefaultRoutePlan =
  | {
      scenario: "java-mod-workspace";
      reasons: string[];
      defaultRoutingScenario: "project_symbol";
      steps: AgentRuntimeRouteStep[];
    }
  | {
      scenario: "kubejs-workspace";
      reasons: string[];
      defaultRoutingScenario: "kubejs_script";
      steps: AgentRuntimeRouteStep[];
    }
  | {
      scenario: "datapack-workspace";
      reasons: string[];
      defaultRoutingScenario: "datapack_lookup";
      steps: AgentRuntimeRouteStep[];
    }
  | {
      scenario: "modpack-workspace";
      reasons: string[];
      defaultRoutingScenario: "project_symbol";
      steps: AgentRuntimeRouteStep[];
    }
  | {
      scenario: "unknown-workspace";
      reasons: string[];
      steps: AgentRuntimeRouteStep[];
    };

export interface AgentRuntimeHarnessFacts {
  hasGradle: boolean;
  hasJavaSource: boolean;
  hasKubeJS: boolean;
  hasProbeJS: boolean;
  hasModArchives: boolean;
  hasDatapack: boolean;
  buildFileCount: number;
  javaSourceRootCount: number;
  datapackRootCount: number;
  logPathCount: number;
}

export interface AgentRuntimeHarnessSnapshot {
  workspaceRoot?: string;
  workspaceKind: WorkspaceKind;
  detectorReasons: string[];
  currentRuntime?: CurrentRuntime;
  routePlan: AgentRuntimeDefaultRoutePlan;
  authoringPolicy?: AgentRuntimeAuthoringPolicy;
  facts: AgentRuntimeHarnessFacts;
}

export type AgentRuntimeAuthoringSignal =
  | "probejs_types"
  | "workspace_facts"
  | "modding_docs";

export interface AgentRuntimeAuthoringPolicy {
  profile: "kubejs_script";
  runtimeModel: "minecraft_scripting";
  structureModel: "lifecycle_domain";
  preferredSignalOrder: AgentRuntimeAuthoringSignal[];
  preferNamedFunctions: boolean;
  avoidGenericJavaScriptPatterns: boolean;
  allowPersistentConsole: boolean;
  requireExplicitDebugGate: boolean;
  preferDocBackedAnswers: boolean;
}

export type AgentRuntimeTaskIntentId =
  | "workspace_default"
  | "crash_triage"
  | "external_mod_resolution"
  | "java_diagnostics"
  | "kubejs_authoring"
  | "datapack_lookup"
  | "resource_pack_lookup";

export interface AgentRuntimeTaskIntent {
  id: AgentRuntimeTaskIntentId;
  confidence: RuntimeConfidence;
  reasons: string[];
}

export type AgentRuntimeToolName =
  | "workspace.analyze"
  | "source.bundle"
  | "context.query"
  | "migration.analyze";

export type AgentRuntimePromptFragmentId =
  | "workspace_summary"
  | "route_policy"
  | "tool_policy"
  | "kubejs_authoring_policy"
  | "service_profile"
  | "task_intent_summary"
  | "task_route_policy"
  | "task_tool_policy"
  | "task_evidence_policy"
  | "task_kubejs_scripting_policy";

export interface AgentRuntimePromptFragment {
  id: AgentRuntimePromptFragmentId;
  text: string;
}

export interface AgentRuntimeHarnessBrief {
  snapshot: AgentRuntimeHarnessSnapshot;
  authoringPolicy?: AgentRuntimeAuthoringPolicy;
  availableTools: AgentRuntimeToolName[];
  preferredTools: AgentRuntimeToolName[];
  promptFragments: AgentRuntimePromptFragment[];
}

export interface AgentRuntimeTaskRoute {
  intent: AgentRuntimeTaskIntent;
  reasons: string[];
  steps: AgentRuntimeTaskRouteStep[];
  preferredTools: AgentRuntimeToolName[];
}

export interface AgentRuntimeTaskBrief {
  snapshot: AgentRuntimeHarnessSnapshot;
  authoringPolicy?: AgentRuntimeAuthoringPolicy;
  intent: AgentRuntimeTaskIntent;
  taskRoute: AgentRuntimeTaskRoute;
  availableTools: AgentRuntimeToolName[];
  preferredTools: AgentRuntimeToolName[];
  promptFragments: AgentRuntimePromptFragment[];
}

export interface AgentRuntimeBootstrapOptions {
  runtimeRoot: string;
  workspace?: WorkspaceBootstrapInput;
}

export interface McpServerBootstrapOptions {
  runtimeRoot: string;
  workspace?: WorkspaceBootstrapInput;
}

export interface AgentRuntimeBootstrap {
  appId: "agent-runtime";
  runtimePolicy: ManagedRuntimePolicy;
  harnessPackage: "@mcpskill/agent-harness";
  traceEnabled: true;
  workspaceContext?: WorkspaceBootstrapContext;
  defaultRoutePlan?: AgentRuntimeDefaultRoutePlan;
  harnessSnapshot?: AgentRuntimeHarnessSnapshot;
  harnessBrief?: AgentRuntimeHarnessBrief;
}

export interface McpServerBootstrap {
  appId: "mcp-server";
  runtimePolicy: ManagedRuntimePolicy;
  corePackages: string[];
  workspaceContext?: WorkspaceBootstrapContext;
}

export interface McpServerRequestContext {
  appId: "mcp-server";
  requestText?: string;
  workspaceContext?: WorkspaceBootstrapContext;
  harnessSnapshot: AgentRuntimeHarnessSnapshot;
  harnessBrief: AgentRuntimeHarnessBrief;
  taskBrief: AgentRuntimeTaskBrief;
}

export type AgentRuntimeDefaultRoutingScenario = Exclude<
  AgentRuntimeDefaultRoutePlan,
  { scenario: "unknown-workspace" }
>["defaultRoutingScenario"];

export type McpServerPromptSectionId =
  | "request_text"
  | AgentRuntimePromptFragmentId;

export interface McpServerPromptSection {
  id: McpServerPromptSectionId;
  role: "user" | "system";
  title: string;
  text: string;
}

export interface McpServerPromptAssembly {
  sections: McpServerPromptSection[];
  text: string;
}

export interface McpServerToolGuidance {
  availableTools: AgentRuntimeToolName[];
  preferredTools: AgentRuntimeToolName[];
  routeSteps: AgentRuntimeTaskRouteStep[];
}

export interface McpServerRequestTrace {
  workspaceKind: WorkspaceKind;
  defaultRouteScenario?: AgentRuntimeDefaultRoutingScenario;
  defaultRouteSteps: AgentRuntimeRouteStep[];
  taskIntent: AgentRuntimeTaskIntent;
  taskRouteReasons: string[];
  taskRouteSteps: AgentRuntimeTaskRouteStep[];
  selectedPromptFragmentIds: AgentRuntimePromptFragmentId[];
}

export interface McpServerRequestPlan {
  appId: "mcp-server";
  requestText?: string;
  requestContext: McpServerRequestContext;
  prompt: McpServerPromptAssembly;
  toolGuidance: McpServerToolGuidance;
  trace: McpServerRequestTrace;
}
