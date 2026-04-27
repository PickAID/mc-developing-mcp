import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";
import { executeMcpServerWorkspaceAnalyze } from "./workspace-analyze-executor.js";

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
});

async function createExecutorInput(workspaceRoot: string, requestText: string) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot: "/tmp/mcpskill-runtime",
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "log_files"
  );

  if (!candidate) {
    throw new Error("Expected log_files candidate.");
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
