import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createKubeJsLanguageServiceProject,
  getKubeJsCompletions,
  getKubeJsDiagnostics,
  getKubeJsQuickInfo
} from "./language-service.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("KubeJS TypeScript language service", () => {
  it("returns completions, quick info, and diagnostics from ProbeJS declarations", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-ls");
    const scriptPath = join(workspaceRoot, "kubejs", "server_scripts", "main.js");
    const declarationPath = join(workspaceRoot, ".probe", "server", "events.d.ts");

    await writeText(
      declarationPath,
      [
        "declare const ItemEvents: {",
        "  foodEaten(handler: (event: { item: { id: string } }) => void): void;",
        "};",
        ""
      ].join("\n")
    );
    await writeText(
      scriptPath,
      [
        "ItemEvents.foodEaten((event) => {",
        "  event.item.id;",
        "});",
        ""
      ].join("\n")
    );

    const project = createKubeJsLanguageServiceProject({
      workspaceRoot,
      scriptFiles: [scriptPath],
      declarationFiles: [declarationPath]
    });

    const completion = getKubeJsCompletions(project, {
      filePath: scriptPath,
      search: "ItemEvents."
    });
    const quickInfo = getKubeJsQuickInfo(project, {
      filePath: scriptPath,
      search: "foodEaten"
    });
    const diagnostics = getKubeJsDiagnostics(project, { filePath: scriptPath });

    expect(completion.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "foodEaten" })
      ])
    );
    expect(quickInfo.text).toContain("foodEaten(handler");
    expect(diagnostics).toEqual([]);

    project.dispose();
  });

  it("returns compact diagnostics for invalid KubeJS scripts", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-ls-invalid");
    const scriptPath = join(workspaceRoot, "kubejs", "server_scripts", "main.js");

    await writeText(scriptPath, "MissingGlobal.call();\n");

    const project = createKubeJsLanguageServiceProject({
      workspaceRoot,
      scriptFiles: [scriptPath],
      declarationFiles: []
    });

    expect(getKubeJsDiagnostics(project, { filePath: scriptPath })).toEqual([
      expect.objectContaining({
        filePath: scriptPath,
        message: expect.stringContaining("Cannot find name 'MissingGlobal'")
      })
    ]);

    project.dispose();
  });

  it("supports virtual query files that are not present in the workspace", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-ls-virtual");
    const scriptPath = join(workspaceRoot, "kubejs", "server_scripts", "main.js");
    const declarationPath = join(workspaceRoot, ".probe", "server", "events.d.ts");
    const queryPath = join(workspaceRoot, ".mcpskill", "probe-query.js");

    await writeText(declarationPath, [
      "declare const ItemEvents: {",
      "  foodEaten(handler: (event: { item: { id: string } }) => void): void;",
      "};",
      ""
    ].join("\n"));
    await writeText(scriptPath, "ServerEvents.recipes(event => {});\n");

    const project = createKubeJsLanguageServiceProject({
      workspaceRoot,
      scriptFiles: [scriptPath],
      declarationFiles: [declarationPath],
      virtualFiles: [
        {
          filePath: queryPath,
          content: "ItemEvents.foodEaten;\n"
        }
      ]
    });

    expect(
      getKubeJsCompletions(project, {
        filePath: queryPath,
        search: "ItemEvents."
      }).entries
    ).toEqual(expect.arrayContaining([expect.objectContaining({ name: "foodEaten" })]));
    expect(
      getKubeJsQuickInfo(project, {
        filePath: queryPath,
        search: "foodEaten"
      }).text
    ).toContain("foodEaten(handler");

    project.dispose();
  });

  it("updates virtual query files without recreating the language project", async () => {
    const workspaceRoot = await createTempRoot("mcpskill-kjs-ls-virtual-update");
    const scriptPath = join(workspaceRoot, "kubejs", "server_scripts", "main.js");
    const declarationPath = join(workspaceRoot, ".probe", "server", "events.d.ts");
    const queryPath = join(workspaceRoot, ".mcpskill", "probe-query.js");

    await writeText(declarationPath, [
      "declare const ItemEvents: {",
      "  foodEaten(handler: (event: { item: { id: string } }) => void): void;",
      "};",
      "declare const ServerEvents: {",
      "  recipes(handler: (event: { remove(input: string): void }) => void): void;",
      "};",
      ""
    ].join("\n"));
    await writeText(scriptPath, "ServerEvents.recipes(event => {});\n");

    const project = createKubeJsLanguageServiceProject({
      workspaceRoot,
      scriptFiles: [scriptPath],
      declarationFiles: [declarationPath],
      virtualFiles: [
        {
          filePath: queryPath,
          content: "ItemEvents.foodEaten;\n"
        }
      ]
    });

    project.updateVirtualFile(queryPath, "ServerEvents.recipes;\n");

    expect(
      getKubeJsQuickInfo(project, {
        filePath: queryPath,
        search: "recipes"
      }).text
    ).toContain("recipes(handler");

    project.dispose();
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
