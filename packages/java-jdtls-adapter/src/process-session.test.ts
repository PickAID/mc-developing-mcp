import { PassThrough } from "node:stream";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type { JdtlsServiceProfile } from "./types.js";
import { startJdtlsProcessSession } from "./process-session.js";

describe("startJdtlsProcessSession", () => {
  it("spawns a ready JDTLS profile with workspace data args and returns a session", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jdtls-process-"));
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const spawned: Array<{ command: string; args: string[] }> = [];
    const profile: JdtlsServiceProfile = {
      status: "ready",
      workspaceRoot,
      workspaceDataDir: join(workspaceRoot, ".mc-developing-mcp", "jdtls"),
      workspaceSignals: {
        hasGradleBuild: true,
        hasGradleSettings: false,
        hasMavenPom: false,
        hasJavaSourceRoot: true,
        buildFiles: [join(workspaceRoot, "build.gradle")],
        sourceRoots: [join(workspaceRoot, "src", "main", "java")]
      },
      javaHome: "/jdk",
      javaExecutable: "/jdk/bin/java",
      jdtlsExecutable: "/toolchain/bin/jdtls",
      supportedOperations: ["definition", "references", "hover", "workspaceSymbol", "diagnostics"],
      operationContracts: []
    };

    const processSession = startJdtlsProcessSession({
      profile,
      env: {
        JAVA_HOME: "/jdk",
        PATH: "/toolchain/bin",
        MAVEN_PASSWORD: "must-not-leak"
      },
      spawnProcess: (command, args) => {
        spawned.push({ command, args });
        return {
          stdin,
          stdout,
          pid: 999,
          kill: () => true
        };
      }
    });

    expect(spawned).toEqual([
      {
        command: "/toolchain/bin/jdtls",
        args: ["-data", join(workspaceRoot, ".mc-developing-mcp", "jdtls")]
      }
    ]);
    expect(processSession.session).toBeDefined();
    expect(processSession.stop()).toBe(true);
  });

  it("uses a small allowlisted environment for spawned JDTLS processes", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jdtls-process-"));
    let spawnedEnv: NodeJS.ProcessEnv | undefined;

    startJdtlsProcessSession({
      profile: {
        status: "ready",
        workspaceRoot,
        workspaceDataDir: join(workspaceRoot, ".mc-developing-mcp", "jdtls"),
        workspaceSignals: {
          hasGradleBuild: true,
          hasGradleSettings: false,
          hasMavenPom: false,
          hasJavaSourceRoot: false,
          buildFiles: [],
          sourceRoots: []
        },
        javaExecutable: "/jdk/bin/java",
        jdtlsExecutable: "/toolchain/bin/jdtls",
        supportedOperations: [],
        operationContracts: []
      },
      env: {
        JAVA_HOME: "/jdk",
        PATH: "/toolchain/bin",
        MAVEN_PASSWORD: "must-not-leak"
      },
      spawnProcess: (_command, _args, options) => {
        spawnedEnv = options.env;
        return {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
          kill: () => true
        };
      }
    });

    expect(spawnedEnv).toMatchObject({
      JAVA_HOME: "/jdk",
      PATH: "/toolchain/bin"
    });
    expect(spawnedEnv).not.toHaveProperty("MAVEN_PASSWORD");
  });

  it("rejects profiles that are not ready", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jdtls-process-"));

    expect(() =>
      startJdtlsProcessSession({
        profile: {
          status: "missing_jdtls",
          workspaceRoot,
          workspaceDataDir: join(workspaceRoot, ".mc-developing-mcp", "jdtls"),
          workspaceSignals: {
            hasGradleBuild: true,
            hasGradleSettings: false,
            hasMavenPom: false,
            hasJavaSourceRoot: false,
            buildFiles: [],
            sourceRoots: []
          },
          supportedOperations: [],
          operationContracts: []
        },
        spawnProcess: () => {
          throw new Error("should not spawn");
        }
      })
    ).toThrow("Cannot start JDTLS process when profile status is missing_jdtls.");
  });
});
