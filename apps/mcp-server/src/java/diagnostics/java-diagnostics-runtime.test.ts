import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import type { JdtlsServiceProfile } from "minecraft-developing-mcp-java-jdtls-adapter";

import { createMcpJavaDiagnosticsRuntime } from "./java-diagnostics-runtime.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("createMcpJavaDiagnosticsRuntime", () => {
  it("starts one JDTLS manager per workspace and syncs bounded Java files", async () => {
    const workspaceRoot = await createJavaWorkspace();
    const openedFiles: string[] = [];
    let startCalls = 0;
    const runtime = createMcpJavaDiagnosticsRuntime({
      diagnosticSettleMs: 0,
      maxFallbackJavaFiles: 1,
      buildProfile: async () => readyProfile(workspaceRoot),
      createManager: ({ diagnostics }) => ({
        async start() {
          startCalls += 1;
          return {};
        },
        currentManager() {
          return {
            didOpenJavaFileAutoVersion(input) {
              openedFiles.push(input.filePath);
              diagnostics.publish({
                uri: pathToFileURL(input.filePath).href,
                diagnostics: [
                  {
                    message: "RegistryObject cannot be resolved to a type",
                    severity: 1,
                    range: {
                      start: { line: 3, character: 2 },
                      end: { line: 3, character: 16 }
                    },
                    source: "jdtls"
                  }
                ]
              });
            }
          };
        },
        async stop() {},
        state() {
          return { status: "running", restartAttempts: 0 };
        }
      })
    });

    const first = await runtime.prepare({
      workspaceRoot,
      requestText: "Fix the compile error: cannot resolve symbol RegistryObject."
    });
    const second = await runtime.prepare({
      workspaceRoot,
      requestText: "Fix the compile error again."
    });

    expect(startCalls).toBe(1);
    expect(first).toMatchObject({
      status: "ready",
      syncedFiles: [
        join(workspaceRoot, "src", "main", "java", "example", "Broken.java")
      ]
    });
    expect(second.status).toBe("ready");
    expect(openedFiles).toEqual([
      join(workspaceRoot, "src", "main", "java", "example", "Broken.java"),
      join(workspaceRoot, "src", "main", "java", "example", "Broken.java")
    ]);
    expect(first.diagnostics.drainPending()).toMatchObject([
      {
        diagnostics: [
          {
            message: "RegistryObject cannot be resolved to a type",
            severity: 1
          }
        ]
      }
    ]);
  });

  it("skips startup when JDTLS is unavailable for the workspace", async () => {
    const workspaceRoot = await createJavaWorkspace();
    let startCalls = 0;
    const runtime = createMcpJavaDiagnosticsRuntime({
      buildProfile: async () => ({
        ...readyProfile(workspaceRoot),
        status: "missing_jdtls",
        jdtlsExecutable: undefined
      }),
      createManager: () => {
        startCalls += 1;
        throw new Error("manager should not be created");
      }
    });

    await expect(
      runtime.prepare({
        workspaceRoot,
        requestText: "Fix the compile error."
      })
    ).resolves.toMatchObject({
      status: "unavailable",
      reason: "Java LSP profile is missing_jdtls."
    });
    expect(startCalls).toBe(0);
  });
});

async function createJavaWorkspace(): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-java-runtime-"));
  tempRoots.push(workspaceRoot);

  await writeText(
    join(workspaceRoot, "build.gradle"),
    'plugins { id "java" }\n'
  );
  await writeText(
    join(workspaceRoot, "src", "main", "java", "example", "Broken.java"),
    "package example;\nclass Broken { RegistryObject<?> value; }\n"
  );
  await writeText(
    join(workspaceRoot, "src", "main", "java", "example", "Other.java"),
    "package example;\nclass Other {}\n"
  );

  return workspaceRoot;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}

function readyProfile(workspaceRoot: string): JdtlsServiceProfile {
  return {
    status: "ready",
    workspaceRoot,
    workspaceDataDir: join(workspaceRoot, ".mcpskill", "jdtls"),
    workspaceSignals: {
      hasGradleBuild: true,
      hasGradleSettings: false,
      hasMavenPom: false,
      hasJavaSourceRoot: true,
      buildFiles: [join(workspaceRoot, "build.gradle")],
      sourceRoots: [join(workspaceRoot, "src", "main", "java")]
    },
    javaExecutable: "/usr/bin/java",
    jdtlsExecutable: "/usr/bin/jdtls",
    supportedOperations: ["diagnostics"],
    operationContracts: [
      {
        operation: "diagnostics",
        lspMethod: "textDocument/publishDiagnostics",
        implemented: true
      }
    ]
  };
}
