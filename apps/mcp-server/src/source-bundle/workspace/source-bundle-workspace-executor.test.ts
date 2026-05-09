import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "../../core/bootstrap/bootstrap.js";
import { buildMcpServerEvidencePlan } from "../../request/evidence/evidence-plan.js";
import { buildMcpServerRequestPlan } from "../../request/planning/request-plan.js";
import { buildMcpServerSourceBundleExecutor } from "../core/source-bundle-executor.js";

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
            content: expect.stringContaining("net.neoforged.gradle.userdev"),
            startLine: 1,
            endLine: 4,
            totalLines: 4,
            truncated: false
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
            content: expect.stringContaining("class LocalCaller"),
            startLine: 1,
            endLine: 4,
            totalLines: 4,
            truncated: false
          }
        ]
      }
    });
  });

  it("prioritizes requested Java classes ahead of broad Gradle workspace context", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createJavaModWorkspace();
    await writeText(join(workspaceRoot, "common", "build.gradle"), "plugins { id 'java' }\n");
    await writeText(join(workspaceRoot, "fabric", "build.gradle"), "plugins { id 'java' }\n");
    await writeText(join(workspaceRoot, "neoforge", "build.gradle"), "plugins { id 'java' }\n");
    const input = await createWorkspaceSourceInput(
      runtimeRoot,
      workspaceRoot,
      "Inspect com.example.project.LocalCaller and explain where it is implemented in this Gradle workspace."
    );
    const executor = buildMcpServerSourceBundleExecutor({
      runtimeRoot,
      executeRecipe: async () => {
        throw new Error("vanilla recipe should not run");
      }
    });

    const result = await executor(input);

    expect(result?.payload).toMatchObject({
      source: "workspace_source",
      mode: "local_files"
    });
    expect(result?.payload.references[0]).toMatchObject({
      relativePath: "src/main/java/com/example/project/LocalCaller.java",
      kind: "java",
      symbol: "com.example.project.LocalCaller",
      content: expect.stringContaining("class LocalCaller")
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
            content: expect.stringContaining("class LocalCaller"),
            startLine: 1,
            endLine: 4,
            totalLines: 4,
            truncated: false
          }
        ]
      }
    });
  });

  it("bounds local Java source around diagnostic line hints", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createJavaModWorkspace();
    const input = await createWorkspaceSourceInput(
      runtimeRoot,
      workspaceRoot,
      [
        "Java diagnostics: LongCaller.java:30:10 Example diagnostic",
        "Java diagnostic source files: src/main/java/com/example/project/LongCaller.java"
      ].join("\n")
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
        references: [
          {
            relativePath: "src/main/java/com/example/project/LongCaller.java",
            startLine: 10,
            endLine: 50,
            totalLines: 62,
            truncated: true,
            content: expect.stringContaining("  // line 30")
          }
        ]
      }
    });
  });

  it("reads explicit source follow-up ranges", async () => {
    const runtimeRoot = await createTempRoot("mcpskill-runtime-");
    const workspaceRoot = await createJavaModWorkspace();
    const input = await createWorkspaceSourceInput(
      runtimeRoot,
      workspaceRoot,
      "source.read src/main/java/com/example/project/LongCaller.java:20-25"
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
        references: [
          {
            relativePath: "src/main/java/com/example/project/LongCaller.java",
            startLine: 20,
            endLine: 25,
            totalLines: 62,
            truncated: true,
            nextReads: [
              "source.read src/main/java/com/example/project/LongCaller.java:20-25"
            ],
            content: [
              "  // line 20",
              "  // line 21",
              "  // line 22",
              "  // line 23",
              "  // line 24",
              "  // line 25"
            ].join("\n")
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
  await writeText(
    join(
      workspaceRoot,
      "src",
      "main",
      "java",
      "com",
      "example",
      "project",
      "LongCaller.java"
    ),
    [
      "package com.example.project;",
      "public final class LongCaller {",
      ...Array.from({ length: 59 }, (_, index) => `  // line ${index + 3}`),
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
