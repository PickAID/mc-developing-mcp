import type { SourceAcquisitionWorkItem } from "./source-acquisition-hand-off.js";

export interface SourceAcquisitionWorkItemHandlerResult {
  summary: string;
  payload?: unknown;
}

export interface SourceAcquisitionWorkItemRunnerHandlers {
  jarIndex?: (
    item: Extract<SourceAcquisitionWorkItem, { kind: "jar_index" }>
  ) => Promise<SourceAcquisitionWorkItemHandlerResult>;
  vanillaGeneration?: (
    item: Extract<SourceAcquisitionWorkItem, { kind: "vanilla_generation" }>
  ) => Promise<SourceAcquisitionWorkItemHandlerResult>;
  remoteMetadata?: (
    item: Extract<SourceAcquisitionWorkItem, { kind: "remote_metadata" }>
  ) => Promise<SourceAcquisitionWorkItemHandlerResult>;
}

export type SourceAcquisitionWorkItemExecutionStatus =
  | "completed"
  | "skipped"
  | "failed";

export interface SourceAcquisitionWorkItemExecution {
  kind: SourceAcquisitionWorkItem["kind"];
  status: SourceAcquisitionWorkItemExecutionStatus;
  summary: string;
  reason?: "handler_unavailable";
  error?: string;
  payload?: unknown;
}

export interface SourceAcquisitionWorkItemRunnerInput {
  workItems: SourceAcquisitionWorkItem[];
  handlers: SourceAcquisitionWorkItemRunnerHandlers;
}

export interface SourceAcquisitionWorkItemRunnerResult {
  status: "completed" | "partial" | "empty";
  completedCount: number;
  skippedCount: number;
  failedCount: number;
  executions: SourceAcquisitionWorkItemExecution[];
}

export async function runSourceAcquisitionWorkItems(
  input: SourceAcquisitionWorkItemRunnerInput
): Promise<SourceAcquisitionWorkItemRunnerResult> {
  const executions: SourceAcquisitionWorkItemExecution[] = [];

  for (const workItem of input.workItems) {
    executions.push(await runSourceAcquisitionWorkItem(workItem, input.handlers));
  }

  return summarizeExecutions(executions);
}

async function runSourceAcquisitionWorkItem(
  workItem: SourceAcquisitionWorkItem,
  handlers: SourceAcquisitionWorkItemRunnerHandlers
): Promise<SourceAcquisitionWorkItemExecution> {
  const handler = selectHandler(workItem, handlers);

  if (!handler) {
    return {
      kind: workItem.kind,
      status: "skipped",
      reason: "handler_unavailable",
      summary: `No handler is available for ${workItem.kind}.`
    };
  }

  try {
    const result = await handler(workItem as never);
    return {
      kind: workItem.kind,
      status: "completed",
      summary: result.summary,
      payload: result.payload
    };
  } catch (error) {
    return {
      kind: workItem.kind,
      status: "failed",
      summary: `${workItem.kind} failed.`,
      error: errorMessage(error)
    };
  }
}

function selectHandler(
  workItem: SourceAcquisitionWorkItem,
  handlers: SourceAcquisitionWorkItemRunnerHandlers
) {
  switch (workItem.kind) {
    case "jar_index":
      return handlers.jarIndex;
    case "vanilla_generation":
      return handlers.vanillaGeneration;
    case "remote_metadata":
      return handlers.remoteMetadata;
  }
}

function summarizeExecutions(
  executions: SourceAcquisitionWorkItemExecution[]
): SourceAcquisitionWorkItemRunnerResult {
  const completedCount = executions.filter(
    (execution) => execution.status === "completed"
  ).length;
  const skippedCount = executions.filter(
    (execution) => execution.status === "skipped"
  ).length;
  const failedCount = executions.filter(
    (execution) => execution.status === "failed"
  ).length;

  return {
    status: resolveRunnerStatus(executions.length, skippedCount, failedCount),
    completedCount,
    skippedCount,
    failedCount,
    executions
  };
}

function resolveRunnerStatus(
  executionCount: number,
  skippedCount: number,
  failedCount: number
): SourceAcquisitionWorkItemRunnerResult["status"] {
  if (executionCount === 0) {
    return "empty";
  }

  return skippedCount === 0 && failedCount === 0 ? "completed" : "partial";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
