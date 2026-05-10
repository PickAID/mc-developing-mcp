import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildJdtlsServiceProfile, type ExecutableResolver } from "./index.js";

const createResolver =
  (executables: Record<string, string | undefined>): ExecutableResolver =>
  async (name) =>
    executables[name];

describe("buildJdtlsServiceProfile", () => {
  it("returns a ready profile for a Java workspace with jdtls and java", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jdtls-ready-"));
    await writeFile(join(workspaceRoot, "build.gradle.kts"), "plugins { java }");
    await mkdir(join(workspaceRoot, "src", "main", "java"), { recursive: true });

    const profile = await buildJdtlsServiceProfile({
      workspaceRoot,
      env: {
        JAVA_HOME: "/opt/test-jdk",
        JDTLS_PATH: "/opt/jdtls/bin/jdtls"
      },
      executableResolver: createResolver({})
    });

    expect(profile).toMatchObject({
      status: "ready",
      workspaceRoot,
      jdtlsExecutable: "/opt/jdtls/bin/jdtls",
      javaHome: "/opt/test-jdk",
      javaExecutable: join("/opt/test-jdk", "bin", "java"),
      workspaceSignals: {
        hasGradleBuild: true,
        hasMavenPom: false,
        hasJavaSourceRoot: true
      },
      supportedOperations: [
        "definition",
        "references",
        "hover",
        "workspaceSymbol",
        "diagnostics"
      ]
    });
    expect(profile.workspaceDataDir).toBe(
      join(workspaceRoot, ".mc-developing-mcp", "jdtls")
    );
    expect(profile.operationContracts).toEqual([
      {
        operation: "definition",
        lspMethod: "textDocument/definition",
        implemented: true
      },
      {
        operation: "references",
        lspMethod: "textDocument/references",
        implemented: true
      },
      {
        operation: "hover",
        lspMethod: "textDocument/hover",
        implemented: true
      },
      {
        operation: "workspaceSymbol",
        lspMethod: "workspace/symbol",
        implemented: true
      },
      {
        operation: "diagnostics",
        lspMethod: "textDocument/publishDiagnostics",
        implemented: true
      }
    ]);
  });

  it("returns missing_jdtls when Java is available but jdtls is unresolved", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jdtls-missing-"));
    await writeFile(join(workspaceRoot, "pom.xml"), "<project />");

    const profile = await buildJdtlsServiceProfile({
      workspaceRoot,
      env: {},
      executableResolver: createResolver({ java: "/usr/bin/java" })
    });

    expect(profile).toMatchObject({
      status: "missing_jdtls",
      javaExecutable: "/usr/bin/java",
      jdtlsExecutable: undefined,
      workspaceSignals: {
        hasMavenPom: true
      }
    });
  });

  it("returns not_java_workspace before checking missing tools", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jdtls-empty-"));

    const profile = await buildJdtlsServiceProfile({
      workspaceRoot,
      env: {},
      executableResolver: createResolver({})
    });

    expect(profile).toMatchObject({
      status: "not_java_workspace",
      jdtlsExecutable: undefined,
      javaExecutable: undefined,
      workspaceSignals: {
        hasGradleBuild: false,
        hasMavenPom: false,
        hasJavaSourceRoot: false
      }
    });
  });
});
