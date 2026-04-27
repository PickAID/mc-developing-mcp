import type {
  AgentRuntimeToolName,
  McpServerBootstrap
} from "@mcpskill/shared-types";
import type { DocsPackageSelectionResult } from "@mcpskill/docs-retrieval";
import type { ArchiveContentCache } from "@mcpskill/jar-source-adapter";
import {
  buildLocalSourcePackageRecipeExecutor,
  type SourcePackageRecipeExecutor
} from "@mcpskill/source-package-manager";

import {
  buildMcpServerEvidencePlan,
  type McpServerEvidencePlan
} from "./evidence-plan.js";
import { buildMcpServerDocsSelection } from "./docs-selection.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";
import { buildMcpServerContextQueryExecutor } from "./context-query-executor.js";
import type { McpServerContextQueryExecutorOptions } from "./context-query-executor.js";
import {
  buildMcpServerSourceBundleExecutor,
  type McpServerSourceBundleExecutorOptions
} from "./source-bundle-executor.js";
import { executeMcpServerWorkspaceAnalyze } from "./workspace-analyze-executor.js";
import type { McpServerEvidenceExecutor } from "./request-handler.js";
import {
  buildContextExecution,
  buildFailedExecution,
  buildRequestResult,
  buildSelectedExecution,
  buildSkippedExecution,
  type McpServerRequestExecution,
  type McpServerRequestExecutorResult
} from "./request-execution-record.js";
import {
  createRequestExecutionContext,
  prepareExecutorInput,
  rememberContext,
  shouldUseAsContext
} from "./request-execution-context.js";

export type {
  McpServerRequestExecution,
  McpServerRequestExecutionStatus,
  McpServerRequestExecutorResult
} from "./request-execution-record.js";

export interface McpServerRequestExecutorOptions {
  bootstrap: Pick<McpServerBootstrap, "runtimePolicy" | "workspaceContext">;
  requestText?: string;
  executors?: Partial<Record<AgentRuntimeToolName, McpServerEvidenceExecutor>>;
  sourceBundle?: McpServerRequestSourceBundleOptions;
  contextQuery?: McpServerContextQueryExecutorOptions;
  modArchiveContentCache?: ArchiveContentCache;
}

export type McpServerRequestSourceBundleOptions = Omit<
  McpServerSourceBundleExecutorOptions,
  "runtimeRoot" | "executeRecipe"
> & {
  executeRecipe?: SourcePackageRecipeExecutor;
};

export async function executeMcpServerRequest(
  options: McpServerRequestExecutorOptions
): Promise<McpServerRequestExecutorResult> {
  const requestPlan = buildMcpServerRequestPlan(
    options.bootstrap,
    options.requestText
  );
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const executors = {
    ...buildDefaultExecutors(options),
    ...options.executors
  };

  return executeEvidencePlanWithContext({
    evidencePlan,
    executors
  });
}

function buildDefaultExecutors(
  options: McpServerRequestExecutorOptions
): Partial<Record<AgentRuntimeToolName, McpServerEvidenceExecutor>> {
  return {
    "workspace.analyze": executeMcpServerWorkspaceAnalyze,
    "source.bundle": buildMcpServerSourceBundleExecutor({
      ...options.sourceBundle,
      runtimeRoot: options.bootstrap.runtimePolicy.runtimeRoot,
      executeRecipe:
        options.sourceBundle?.executeRecipe ??
        buildLocalSourcePackageRecipeExecutor()
    }),
    "context.query": buildMcpServerContextQueryExecutor({
      ...options.contextQuery,
      modArchiveContentCache:
        options.contextQuery?.modArchiveContentCache ??
        options.modArchiveContentCache
    })
  };
}

async function executeEvidencePlanWithContext(input: {
  evidencePlan: McpServerEvidencePlan;
  executors: Partial<Record<AgentRuntimeToolName, McpServerEvidenceExecutor>>;
}): Promise<McpServerRequestExecutorResult> {
  const executions: McpServerRequestExecution[] = [];
  const context = createRequestExecutionContext();
  let selectedEvidence: McpServerRequestExecution | undefined;

  for (const candidate of input.evidencePlan.candidates) {
    const executor = input.executors[candidate.preferredTool];
    if (!executor) {
      executions.push(
        buildFailedExecution(
          candidate,
          false,
          `No executor registered for ${candidate.preferredTool}.`
        )
      );
      continue;
    }

    let docsSelection: DocsPackageSelectionResult | undefined;

    try {
      const preparedInput = prepareExecutorInput(
        input.evidencePlan,
        candidate,
        context
      );
      docsSelection = buildMcpServerDocsSelection(
        preparedInput.requestPlan,
        preparedInput.candidate
      );
      const result = await executor({ ...preparedInput, docsSelection });

      if (!result.matched) {
        executions.push(
          buildSkippedExecution(
            candidate,
            true,
            result.summary,
            result.payload,
            docsSelection
          )
        );
        continue;
      }

      if (shouldUseAsContext(candidate, result, input.evidencePlan)) {
        rememberContext(result.payload, context);
        executions.push(buildContextExecution(candidate, result, docsSelection));
        continue;
      }

      selectedEvidence = buildSelectedExecution(candidate, result, docsSelection);
      executions.push(selectedEvidence);
      break;
    } catch (error) {
      executions.push(
        buildFailedExecution(
          candidate,
          true,
          `Executor failed for ${candidate.preferredTool}.`,
          undefined,
          toErrorMessage(error),
          docsSelection
        )
      );
    }
  }

  return buildRequestResult(input.evidencePlan, executions, selectedEvidence);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
