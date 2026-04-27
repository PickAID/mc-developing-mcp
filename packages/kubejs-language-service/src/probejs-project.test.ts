import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverProbeJsLanguageProject } from "./probejs-project.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("discoverProbeJsLanguageProject", () => {
  it("loads scoped declarations plus shared declarations and snippets", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-probe-scope");

    await writeText(join(workspaceRoot, ".probe", "server", "server.d.ts"), "server");
    await writeText(join(workspaceRoot, ".probe", "shared", "shared.d.ts"), "shared");
    await writeText(join(workspaceRoot, ".probe", "startup", "startup.d.ts"), "startup");
    await writeText(join(workspaceRoot, ".vscode", "probe.code-snippets"), "{}");

    const result = await discoverProbeJsLanguageProject({
      workspaceRoot,
      scope: "server"
    });

    expect(result.declarationFiles.map((file) => file.relativePath)).toEqual([
      ".probe/server/server.d.ts",
      ".probe/shared/shared.d.ts"
    ]);
    expect(result.snippetFiles.map((file) => file.relativePath)).toEqual([
      ".vscode/probe.code-snippets"
    ]);
    expect(result.totalDeclarationBytes).toBe("server".length + "shared".length);
    expect(result.truncated).toBe(false);
  });

  it("falls back to legacy flat ProbeJS declarations when scoped roots are absent", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-probe-flat");

    await writeText(join(workspaceRoot, ".probe", "legacy.d.ts"), "legacy");

    const result = await discoverProbeJsLanguageProject({
      workspaceRoot,
      scope: "startup"
    });

    expect(result.declarationFiles.map((file) => file.relativePath)).toEqual([
      ".probe/legacy.d.ts"
    ]);
    expect(result.totalDeclarationBytes).toBe("legacy".length);
  });

  it("falls back to kubejs/probe/generated declarations for ProbeJS legacy layouts", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-probe-generated");

    await writeText(
      join(workspaceRoot, "kubejs", "probe", "generated", "events.d.ts"),
      "declare const ItemEvents: unknown;\n"
    );

    const result = await discoverProbeJsLanguageProject({
      workspaceRoot,
      scope: "server"
    });

    expect(result.declarationFiles.map((file) => file.relativePath)).toEqual([
      "kubejs/probe/generated/events.d.ts"
    ]);
  });

  it("applies max declaration file budgets deterministically", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-probe-budget");

    await writeText(join(workspaceRoot, ".probe", "server", "a.d.ts"), "a");
    await writeText(join(workspaceRoot, ".probe", "server", "b.d.ts"), "bb");

    const result = await discoverProbeJsLanguageProject({
      workspaceRoot,
      scope: "server",
      maxDeclarationFiles: 1
    });

    expect(result.declarationFiles.map((file) => file.relativePath)).toEqual([
      ".probe/server/a.d.ts"
    ]);
    expect(result.totalDeclarationBytes).toBe(1);
    expect(result.truncated).toBe(true);
  });
});

async function createTempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  tempRoots.push(root);
  return root;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
