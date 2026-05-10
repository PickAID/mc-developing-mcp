import { mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { McpServerRequestExecution } from "../../request/execution/request-executor.js";
import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { executeMcpServerRequest } from "../../request/execution/request-executor.js";

const DEFAULT_REQUESTS = [
  "List mod archive inventory and JarJar nested jars for this modpack.",
  "List resource pack asset evidence for local assets, models, and textures.",
  "Query ProbeJS symbol ServerEvents.recipes"
] as const;

interface SmokeConfig {
  workspaceRoot: string;
  runtimeRoot: string;
}

interface SmokeLineInput {
  requestText: string;
  workspaceKind?: string;
  execution: Pick<
    McpServerRequestExecution,
    "routeStep" | "status" | "summary" | "payload"
  >;
}

export interface SmokeLine {
  requestText: string;
  workspaceKind?: string;
  routeStep: McpServerRequestExecution["routeStep"];
  status: McpServerRequestExecution["status"];
  summary: string;
  source?: string;
  mode?: string;
  payloadKeys: string[];
}

export function toSmokeLine(input: SmokeLineInput): SmokeLine {
  const payloadRecord = toRecord(input.execution.payload);

  return {
    requestText: input.requestText,
    workspaceKind: input.workspaceKind,
    routeStep: input.execution.routeStep,
    status: input.execution.status,
    summary: input.execution.summary,
    source: getString(payloadRecord, "source"),
    mode: getString(payloadRecord, "mode"),
    payloadKeys: Object.keys(payloadRecord).sort()
  };
}

export async function runRealWorkspaceSmoke(
  config: SmokeConfig
): Promise<SmokeLine[]> {
  await mkdir(config.runtimeRoot, { recursive: true });

  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: config.runtimeRoot,
    workspace: { workspaceRoot: config.workspaceRoot }
  });
  const workspaceKind = bootstrap.workspaceContext?.descriptor.kind;
  const lines: SmokeLine[] = [];

  for (const requestText of DEFAULT_REQUESTS) {
    const result = await executeMcpServerRequest({ bootstrap, requestText });
    const executions =
      result.executions.length > 0
        ? result.executions
        : result.selectedEvidence
        ? [result.selectedEvidence]
        : [];

    for (const execution of executions) {
      lines.push(toSmokeLine({ requestText, workspaceKind, execution }));
    }
  }

  return lines;
}

export function parseSmokeConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv
): SmokeConfig {
  const args = parseArgs(argv);
  const workspaceRoot =
    getArg(args, "workspaceRoot") ??
    getArg(args, "workspace") ??
    args._[0] ??
    env.MC_DEVELOPING_MCP_SMOKE_WORKSPACE_ROOT;
  const runtimeRoot =
    getArg(args, "runtimeRoot") ??
    getArg(args, "runtime") ??
    env.MC_DEVELOPING_MCP_RUNTIME_ROOT ??
    resolve(tmpdir(), "mc-developing-mcp-real-workspace-smoke");

  if (!workspaceRoot) {
    throw new Error(
      "Missing workspaceRoot. Pass --workspaceRoot, positional argv, or MC_DEVELOPING_MCP_SMOKE_WORKSPACE_ROOT."
    );
  }

  return {
    workspaceRoot: resolve(workspaceRoot),
    runtimeRoot: resolve(runtimeRoot)
  };
}

async function main(): Promise<void> {
  const config = parseSmokeConfig(process.argv.slice(2), process.env);

  if (!(await pathExists(config.workspaceRoot))) {
    process.stdout.write(
      `${JSON.stringify({
        status: "skipped",
        summary: "workspaceRoot does not exist"
      })}\n`
    );
    return;
  }

  const lines = await runRealWorkspaceSmoke(config);

  for (const line of lines) {
    process.stdout.write(`${JSON.stringify(line)}\n`);
  }
}

function parseArgs(argv: readonly string[]): Record<string, string | string[]> & {
  _: string[];
} {
  const parsed: Record<string, string | string[]> & { _: string[] } = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const nextValue = argv[index + 1];
    const value =
      inlineValue ??
      (nextValue && !nextValue.startsWith("--") ? nextValue : "true");

    if (value === nextValue) {
      index += 1;
    }

    parsed[rawKey] = value;
  }

  return parsed;
}

function getArg(
  args: Record<string, string | string[]>,
  key: string
): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function getString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  void main().catch((error: unknown) => {
    const summary = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ status: "failed", summary })}\n`);
    process.exitCode = 1;
  });
}
