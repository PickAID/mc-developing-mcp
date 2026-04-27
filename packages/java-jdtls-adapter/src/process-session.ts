import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

import { JsonRpcStdioClient } from "./json-rpc-client.js";
import { createJdtlsSession, type JdtlsSession } from "./jdtls-session.js";
import type { JdtlsServiceProfile } from "./types.js";

export interface JdtlsChildProcess {
  stdin: Writable;
  stdout: Readable;
  pid?: number;
  kill(signal?: NodeJS.Signals | number): boolean;
  on?(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): JdtlsChildProcess;
  on?(event: "error", listener: (error: Error) => void): JdtlsChildProcess;
}

export type JdtlsProcessSpawner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  }
) => JdtlsChildProcess;

export interface StartJdtlsProcessSessionOptions {
  profile: JdtlsServiceProfile;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  spawnProcess?: JdtlsProcessSpawner;
}

export interface JdtlsProcessSession {
  session: JdtlsSession;
  client: JsonRpcStdioClient;
  process: JdtlsChildProcess;
  command: string;
  args: string[];
  stop(signal?: NodeJS.Signals | number): boolean;
}

export function startJdtlsProcessSession(
  options: StartJdtlsProcessSessionOptions
): JdtlsProcessSession {
  const { profile } = options;

  if (profile.status !== "ready") {
    throw new Error(
      `Cannot start JDTLS process when profile status is ${profile.status}.`
    );
  }
  if (!profile.jdtlsExecutable) {
    throw new Error("Cannot start JDTLS process without jdtlsExecutable.");
  }

  const args = options.args ?? ["-data", profile.workspaceDataDir];
  const childProcess = (options.spawnProcess ?? defaultJdtlsProcessSpawner)(
    profile.jdtlsExecutable,
    args,
    {
      cwd: profile.workspaceRoot,
      env: buildJdtlsProcessEnv(process.env, options.env ?? {})
    }
  );
  const client = new JsonRpcStdioClient({
    reader: childProcess.stdout,
    writer: childProcess.stdin,
    requestTimeoutMs: options.requestTimeoutMs
  });

  return {
    session: createJdtlsSession({
      client,
      workspaceRoot: profile.workspaceRoot,
      processId: childProcess.pid ?? null
    }),
    client,
    process: childProcess,
    command: profile.jdtlsExecutable,
    args,
    stop: (signal) => {
      client.dispose();
      return childProcess.kill(signal);
    }
  };
}

const defaultJdtlsProcessSpawner: JdtlsProcessSpawner = (
  command,
  args,
  options
) => spawn(command, args, options);

const JDTLS_ENV_ALLOWLIST = [
  "HOME",
  "JAVA_HOME",
  "JDK_HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "PATH",
  "TMP",
  "TEMP",
  "TMPDIR",
  "GRADLE_USER_HOME",
  "JDTLS_JVM_ARGS"
] as const;

function buildJdtlsProcessEnv(
  baseEnv: NodeJS.ProcessEnv,
  overrideEnv: NodeJS.ProcessEnv
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key of JDTLS_ENV_ALLOWLIST) {
    const value = overrideEnv[key] ?? baseEnv[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}
