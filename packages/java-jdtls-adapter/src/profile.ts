import { join, resolve } from "node:path";

import {
  defaultExecutableResolver,
  resolveJavaRuntime,
  resolveJdtlsExecutable
} from "./executables.js";
import { JDTLS_OPERATION_CONTRACTS, SUPPORTED_JDTLS_OPERATIONS } from "./operations.js";
import type {
  BuildJdtlsServiceProfileOptions,
  JdtlsServiceProfile,
  JdtlsServiceStatus
} from "./types.js";
import { detectJavaWorkspaceSignals, isJavaWorkspace } from "./workspace.js";

export async function buildJdtlsServiceProfile(
  options: BuildJdtlsServiceProfileOptions
): Promise<JdtlsServiceProfile> {
  const workspaceRoot = resolve(options.workspaceRoot);
  const env = options.env ?? process.env;
  const executableResolver = options.executableResolver ?? defaultExecutableResolver;
  const workspaceSignals = await detectJavaWorkspaceSignals(workspaceRoot);
  const [jdtlsExecutable, javaRuntime] = await Promise.all([
    resolveJdtlsExecutable(env, executableResolver),
    resolveJavaRuntime(env, executableResolver)
  ]);
  const status = resolveStatus({
    isJavaWorkspace: isJavaWorkspace(workspaceSignals),
    jdtlsExecutable,
    javaExecutable: javaRuntime.javaExecutable
  });

  return {
    status,
    workspaceRoot,
    workspaceDataDir: join(workspaceRoot, ".mcpskill", "jdtls"),
    workspaceSignals,
    javaHome: javaRuntime.javaHome,
    javaExecutable: javaRuntime.javaExecutable,
    jdtlsExecutable,
    supportedOperations: SUPPORTED_JDTLS_OPERATIONS,
    operationContracts: JDTLS_OPERATION_CONTRACTS
  };
}

function resolveStatus(input: {
  readonly isJavaWorkspace: boolean;
  readonly jdtlsExecutable?: string;
  readonly javaExecutable?: string;
}): JdtlsServiceStatus {
  if (!input.isJavaWorkspace) {
    return "not_java_workspace";
  }

  if (!input.jdtlsExecutable) {
    return "missing_jdtls";
  }

  if (!input.javaExecutable) {
    return "missing_java";
  }

  return "ready";
}
