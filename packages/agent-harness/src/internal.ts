export const AGENT_HARNESS_PACKAGE = "@mcpskill/agent-harness";

export {
  buildHarnessDefaultRoute,
  buildHarnessDefaultRouteFromBootstrap
} from "./route.js";

export {
  buildHarnessBrief,
  buildHarnessBriefFromBootstrap,
  buildHarnessBriefFromSnapshot
} from "./brief.js";
export {
  buildHarnessAuthoringPolicy,
  buildHarnessAuthoringPolicyFromBootstrap
} from "./policy.js";
export {
  detectHarnessTaskIntent,
  detectHarnessTaskIntentFromSnapshot
} from "./intent.js";
export {
  buildHarnessTaskRoute,
  buildHarnessTaskRouteFromSnapshot
} from "./task-route.js";
export {
  buildHarnessTaskBrief,
  buildHarnessTaskBriefFromBootstrap,
  buildHarnessTaskBriefFromSnapshot
} from "./task-brief.js";

export {
  buildHarnessSnapshot,
  buildHarnessSnapshotFromBootstrap
} from "./snapshot.js";

export {
  detectHarnessScenario,
  detectHarnessScenarioFromBootstrap
} from "./scenario.js";

export type {
  HarnessDefaultRoutePlan,
  HarnessRouteStep
} from "./route.js";

export type { AgentRuntimeHarnessSnapshot } from "@mcpskill/shared-types";
export type {
  AgentRuntimeAuthoringPolicy,
  AgentRuntimeHarnessBrief,
  AgentRuntimeTaskIntent,
  AgentRuntimeTaskBrief,
  AgentRuntimeTaskRoute
} from "@mcpskill/shared-types";

export type {
  HarnessRoutingScenario,
  HarnessScenarioDetection,
  HarnessWorkspaceScenario
} from "./scenario.js";
