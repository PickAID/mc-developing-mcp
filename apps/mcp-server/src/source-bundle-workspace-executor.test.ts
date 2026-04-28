import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { buildMcpServerEvidencePlan } from "./evidence-plan.js";
import { buildMcpServerRequestPlan } from "./request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "./source-bundle-executor.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("source.bundle workspace source execution", () => {
  it("reads local Gradle files before falling back to external sources", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createJavaModWorkspace();
    const input = await createWorkspaceSourceInput(
      runtimeRoot,
      workspaceRoot,
      "Inspect the project build.gradle files for this crash."
    );
    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    await expect(executor(input)).resolves.toMatchObject({
      matched: true,
      summary: "Resolved 1 local workspace source file(s).",
      payload: {
        source: "workspace_source",
        mode: "local_files",
        references: [
          {
            relativePath: "build.gradle",
            kind: "gradle",
            content: expect.stringContaining("net.neoforged.gradle.userdev")
          }
        ]
      }
    });
  });

  it("reads local Java source for qualified project class references", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createJavaModWorkspace();
    const input = await createWorkspaceSourceInput(
      runtimeRoot,
      workspaceRoot,
      "Inspect com.example.project.LocalCaller before searching dependency jars."
    );
    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    await expect(executor(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "workspace_source",
        mode: "local_files",
        references: [
          {
            relativePath: "src/main/java/com/example/project/LocalCaller.java",
            kind: "java",
            symbol: "com.example.project.LocalCaller",
            content: expect.stringContaining("class LocalCaller")
          }
        ]
      }
    });
  });

  it("reads local Java source for requested source file paths", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createJavaModWorkspace();
    const input = await createWorkspaceSourceInput(
      runtimeRoot,
      workspaceRoot,
      "Java diagnostic source files: src/main/java/com/example/project/LocalCaller.java"
    );
    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    await expect(executor(input)).resolves.toMatchObject({
      matched: true,
      payload: {
        source: "workspace_source",
        mode: "local_files",
        references: [
          {
            relativePath: "src/main/java/com/example/project/LocalCaller.java",
            kind: "java",
            symbol: "com.example.project.LocalCaller",
            content: expect.stringContaining("class LocalCaller")
          }
        ]
      }
    });
  });
});

async function createWorkspaceSourceInput(
  runtimeRoot: string,
  workspaceRoot: string,
  requestText: string
) {
  const bootstrap = await buildMcpServerBootstrap({
    runtimeRoot,
    workspace: { workspaceRoot }
  });
  const requestPlan = buildMcpServerRequestPlan(bootstrap, requestText);
  const evidencePlan = buildMcpServerEvidencePlan(requestPlan);
  const candidate = evidencePlan.candidates.find(
    (entry) => entry.routeStep === "workspace_source"
  );

  if (!candidate) {
    throw new Error("workspace_source candidate missing");
  }

  return { candidate, evidencePlan, requestPlan };
}

async function createJavaModWorkspace(): Promise<string> {
  const workspaceRoot = await createTempRoot("mcpskill-java-mod-");

  await writeText(
    join(workspaceRoot, "build.gradle"),
    [
      'plugins { id "net.neoforged.gradle.userdev" version "7.0.0" }',
      "dependencies {",
      '  implementation "com.example:library:1.0.0"',
      "}",
      ""
    ].join("\n")
  );
  await writeText(
    join(
      workspaceRoot,
      "src",
      "main",
      "java",
      "com",
      "example",
      "project",
      "LocalCaller.java"
    ),
    [
      "package com.example.project;",
      "public final class LocalCaller {",
      "  public void call() {}",
      "}",
      ""
    ].join("\n")
  );

  return workspaceRoot;
}

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));

  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
