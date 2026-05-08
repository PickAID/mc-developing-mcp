import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { createLspDiagnosticRegistry } from "minecraft-developing-mcp-java-jdtls-adapter";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../planning/request-plan.js";
import {
  buildMcpServerWorkspaceAnalyzeExecutor,
  executeMcpServerWorkspaceAnalyze
} from "./workspace-analyze-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("executeMcpServerWorkspaceAnalyze", () => {
  it("extracts compact crash signals from workspace log files", async () => {
    const workspaceRoot = await createCrashWorkspace(
      [
        "[Render thread/ERROR] [minecraft/]: java.lang.IllegalStateException: com.example.external.SomeExternalClass.handle failed",
        "\tat com.example.external.SomeExternalClass.handle(SomeExternalClass.java:42)",
        "\tat com.example.project.LocalCaller.call(LocalCaller.java:18)",
        "\tat net.minecraft.server.MinecraftServer.tick(MinecraftServer.java:900)",
        ""
      ].join("\n")
    );
    const input = await createExecutorInput(
      workspaceRoot,
      "The server crashes on startup and latest.log shows an exception in a mod."
    );

    await expect(executeMcpServerWorkspaceAnalyze(input)).resolves.toMatchObject({
      matched: true,
      summary: "Extracted 2 actionable crash class reference(s) from 1 log file(s).",
      payload: {
        source: "workspace_analyze",
        mode: "log_files",
        logFiles: [
          {
            path: expect.stringContaining("logs/latest.log"),
            signalCount: 4
          }
        ],
        signals: {
          exceptionClasses: ["java.lang.IllegalStateException"],
          classReferences: [
            "com.example.external.SomeExternalClass",
            "com.example.project.LocalCaller",
            "net.minecraft.server.MinecraftServer"
          ],
          actionableClassReferences: [
            "com.example.external.SomeExternalClass",
            "com.example.project.LocalCaller"
          ],
          stackFrames: [
            {
              className: "com.example.external.SomeExternalClass",
              methodName: "handle",
              sourceFile: "SomeExternalClass.java",
              lineNumber: 42
            },
            {
              className: "com.example.project.LocalCaller",
              methodName: "call",
              sourceFile: "LocalCaller.java",
              lineNumber: 18
            }
          ]
        },
        truncated: false
      }
    });
  });

  it("extracts missing class names from class loading exceptions", async () => {
    const workspaceRoot = await createCrashWorkspace(
      [
        "java.lang.NoClassDefFoundError: com/example/api/EnergyApi",
        "Caused by: java.lang.ClassNotFoundException: com.example.lib.Helper",
        "\tat net.minecraft.server.MinecraftServer.tick(MinecraftServer.java:900)",
        ""
      ].join("\n")
    );
    const input = await createExecutorInput(
      workspaceRoot,
      "The server crashes on startup with a missing class."
    );

    await expect(executeMcpServerWorkspaceAnalyze(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "workspace_analyze",
        mode: "log_files",
        signals: {
          exceptionClasses: [
            "java.lang.NoClassDefFoundError",
            "java.lang.ClassNotFoundException"
          ],
          classReferences: [
            "com.example.api.EnergyApi",
            "com.example.lib.Helper",
            "net.minecraft.server.MinecraftServer"
          ],
          actionableClassReferences: [
            "com.example.api.EnergyApi",
            "com.example.lib.Helper"
          ]
        }
      }
    });
  });

  it("extracts owner class names from linkage error signatures", async () => {
    const workspaceRoot = await createCrashWorkspace(
      [
        "java.lang.NoSuchMethodError: 'void com.example.api.EnergyApi.transfer(int)'",
        "\tat net.minecraft.server.MinecraftServer.tick(MinecraftServer.java:900)",
        ""
      ].join("\n")
    );
    const input = await createExecutorInput(
      workspaceRoot,
      "The server crashes with a NoSuchMethodError from a dependency."
    );

    await expect(executeMcpServerWorkspaceAnalyze(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "workspace_analyze",
        mode: "log_files",
        signals: {
          exceptionClasses: ["java.lang.NoSuchMethodError"],
          classReferences: [
            "com.example.api.EnergyApi",
            "net.minecraft.server.MinecraftServer"
          ],
          actionableClassReferences: ["com.example.api.EnergyApi"]
        }
      }
    });
  });

  it("drains pending Java LSP diagnostics into compact workspace evidence", async () => {
    const workspaceRoot = await createCrashWorkspace("not a crash log\n");
    const registry = createLspDiagnosticRegistry();
    const workspaceUri = pathToFileURL(
      join(workspaceRoot, "src", "main", "java", "example", "Broken.java")
    ).href;
    const externalUri = pathToFileURL(
      join(tmpdir(), "other-workspace", "src", "main", "java", "Other.java")
    ).href;

    registry.publish({
      uri: workspaceUri,
      diagnostics: [
        diagnostic("RegistryObject cannot be resolved to a type", 1),
        diagnostic("Unused import", 3)
      ]
    });
    registry.publish({
      uri: externalUri,
      diagnostics: [diagnostic("External workspace error", 1)]
    });
    const input = await createExecutorInput(
      workspaceRoot,
      "Fix the compile error: cannot resolve symbol RegistryObject."
    );
    const candidate = input.evidencePlan.candidates.find(
      (entry) => entry.routeStep === "java_diagnostics"
    );

    if (!candidate) {
      throw new Error("Expected java_diagnostics candidate.");
    }

    await expect(
      buildMcpServerWorkspaceAnalyzeExecutor({
        lspDiagnostics: registry
      })({ ...input, candidate })
    ).resolves.toMatchObject({
      matched: true,
      summary: "Drained 2 pending Java LSP diagnostic(s) from 1 file(s).",
      payload: {
        source: "workspace_analyze",
        mode: "java_diagnostics",
        totalDiagnostics: 2,
        files: [
          {
            uri: workspaceUri,
            diagnosticCount: 2,
            diagnostics: [
              {
                message: "RegistryObject cannot be resolved to a type",
                severity: "error",
                line: 2,
                character: 1
              },
              {
                message: "Unused import",
                severity: "information",
                line: 4,
                character: 1
              }
            ]
          }
        ],
        truncated: false
      }
    });
    expect(registry.drainPending()).toEqual([
      {
        uri: externalUri,
        diagnostics: [diagnostic("External workspace error", 1)]
      }
    ]);
  });

  it("reports Java diagnostics runtime unavailability before falling back", async () => {
    const workspaceRoot = await createCrashWorkspace("not a crash log\n");
    const registry = createLspDiagnosticRegistry();
    const input = await createExecutorInput(
      workspaceRoot,
      "Fix the compile error: cannot resolve symbol RegistryObject."
    );
    const candidate = input.evidencePlan.candidates.find(
      (entry) => entry.routeStep === "java_diagnostics"
    );

    if (!candidate) {
      throw new Error("Expected java_diagnostics candidate.");
    }

    await expect(
      buildMcpServerWorkspaceAnalyzeExecutor({
        lspDiagnostics: registry,
        javaDiagnosticsPreparation: {
          status: "unavailable",
          diagnostics: registry,
          syncedFiles: [],
          profileStatus: "missing_jdtls",
          reason: "Java LSP profile is missing_jdtls."
        }
      })({ ...input, candidate })
    ).resolves.toMatchObject({
      matched: false,
      summary: "Java diagnostics unavailable: Java LSP profile is missing_jdtls.",
      payload: {
        source: "workspace_analyze",
        mode: "java_diagnostics",
        status: "unavailable",
        profileStatus: "missing_jdtls",
        reason: "Java LSP profile is missing_jdtls.",
        totalDiagnostics: 0,
        files: [],
        truncated: false
      }
    });
  });
});

async function createExecutorInput(workspaceRoot: string, requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mcpskill-runtime",
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates[0];

  if (!candidate) {
    throw new Error("Expected at least one evidence candidate.");
  }

  return { candidate, evidencePlan, requestPlan };
}

async function createCrashWorkspace(logText: string): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-crash-log-"));

  tempRoots.push(workspaceRoot);
  await writeText(join(workspaceRoot, "build.gradle"), "plugins { id 'java' }\n");
  await writeText(join(workspaceRoot, "logs", "latest.log"), logText);
  return workspaceRoot;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

function diagnostic(message: string, severity: number) {
  return {
    message,
    severity,
    range: {
      start: { line: severity, character: 0 },
      end: { line: severity, character: 1 }
    },
    source: "jdtls"
  };
}
