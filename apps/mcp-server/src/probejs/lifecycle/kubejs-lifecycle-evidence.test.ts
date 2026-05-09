import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ProbeJsLanguageProjectFile } from "minecraft-developing-mcp-kubejs-language-service";

import { buildKubeJsLifecycleEvidence } from "./kubejs-lifecycle-evidence.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("buildKubeJsLifecycleEvidence", () => {
  it("reports ProbeJS native event availability and startup-only warnings", async () => {
    const workspaceRoot = await createWorkspace({
      declarationContent: [
        "declare const ForgeEvents: { onEvent(name: string, handler: Function): void };",
        "declare const NativeEvents: { onEvent(type: unknown, handler: Function): void };",
        ""
      ].join("\n")
    });
    const selectedScriptFile = join(
      workspaceRoot,
      "kubejs",
      "server_scripts",
      "main.js"
    );

    await expect(
      buildKubeJsLifecycleEvidence({
        workspaceRoot,
        requestText: "Use server_scripts ForgeEvents and NativeEvents.",
        selectedScriptFile,
        selectedScope: "server",
        declarationFiles: [await declarationFile(workspaceRoot)],
        scriptFiles: [selectedScriptFile]
      })
    ).resolves.toMatchObject({
      lifecycleEvidence: {
        selectedScope: "server",
        selectedScriptFile: "kubejs/server_scripts/main.js",
        declarationScopes: ["server"],
        requestMentions: expect.arrayContaining(["server_scripts", "server"])
      },
      nativeEventEvidence: {
        forgeEvents: {
          requested: true,
          availability: "verified_by_probejs",
          warnings: [
            expect.stringContaining("startup-only")
          ]
        },
        nativeEvents: {
          requested: true,
          availability: "verified_by_probejs",
          declarationFiles: [".probe/server/events.d.ts"]
        }
      }
    });
  });

  it("extracts compact global ownership evidence from KubeJS scripts", async () => {
    const workspaceRoot = await createWorkspace({
      scriptContent: [
        "global.machineCache = {};",
        "Global.recipeOwner(event);",
        "global.data;",
        ""
      ].join("\n")
    });
    const selectedScriptFile = join(
      workspaceRoot,
      "kubejs",
      "server_scripts",
      "main.js"
    );

    await expect(
      buildKubeJsLifecycleEvidence({
        workspaceRoot,
        requestText: "Check KubeJS global state.",
        selectedScriptFile,
        selectedScope: "server",
        declarationFiles: [await declarationFile(workspaceRoot)],
        scriptFiles: [selectedScriptFile]
      })
    ).resolves.toMatchObject({
      globalStateEvidence: {
        usageCount: 3,
        keys: ["data", "machineCache", "recipeOwner"],
        riskyKeys: ["data"],
        usages: [
          {
            file: "kubejs/server_scripts/main.js",
            line: 1,
            scope: "server",
            object: "global",
            key: "machineCache",
            operation: "write"
          },
          {
            object: "Global",
            key: "recipeOwner",
            operation: "call"
          },
          {
            key: "data",
            operation: "read"
          }
        ]
      }
    });
  });

  it("reports KubeJS script quality issues without treating scripts as generic JS", async () => {
    const workspaceRoot = await createWorkspace({
      scriptContent: [
        "import { helper } from './helper.js';",
        "const cache = {};",
        "console.log('debug recipe');",
        "ForgeEvents.onEvent('net.minecraftforge.event.TickEvent', event => {});",
        "ServerEvents.recipes(event => {",
        "  const nestedRecipeState = {};",
        "});",
        "String('console.log and ForgeEvents.onEvent');",
        "ServerEvents.recipes(event => {}); // console.log('ignored')",
        ""
      ].join("\n")
    });
    const selectedScriptFile = join(
      workspaceRoot,
      "kubejs",
      "server_scripts",
      "main.js"
    );

    await expect(
      buildKubeJsLifecycleEvidence({
        workspaceRoot,
        requestText: "lint KubeJS server_scripts console debug and lifecycle scope.",
        selectedScriptFile,
        selectedScope: "server",
        declarationFiles: [await declarationFile(workspaceRoot)],
        scriptFiles: [selectedScriptFile]
      })
    ).resolves.toMatchObject({
      scriptQualityEvidence: {
        fileCount: 1,
        scannedFileCount: 1,
        issueCount: 4,
        severityCounts: {
          error: 1,
          warning: 2,
          info: 1
        },
        issues: [
          {
            kind: "generic_js_module_pattern",
            severity: "warning",
            file: "kubejs/server_scripts/main.js",
            line: 1,
            scope: "server"
          },
          {
            kind: "top_level_state_declaration",
            severity: "info",
            line: 2
          },
          {
            kind: "persistent_console_output",
            severity: "warning",
            line: 3
          },
          {
            kind: "lifecycle_scope_mismatch",
            severity: "error",
            line: 4
          }
        ],
        truncated: false
      }
    });
  });
});

async function createWorkspace(options: {
  declarationContent?: string;
  scriptContent?: string;
} = {}): Promise<string> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-kjs-evidence-"));
  tempRoots.push(workspaceRoot);

  await writeText(
    join(workspaceRoot, "kubejs", "server_scripts", "main.js"),
    options.scriptContent ?? "ItemEvents.foodEaten(event => {});\n"
  );
  await writeText(
    join(workspaceRoot, ".probe", "server", "events.d.ts"),
    options.declarationContent ??
      "declare const ItemEvents: { foodEaten(handler: Function): void };\n"
  );

  return workspaceRoot;
}

async function declarationFile(
  workspaceRoot: string
): Promise<ProbeJsLanguageProjectFile> {
  const absolutePath = join(workspaceRoot, ".probe", "server", "events.d.ts");
  const fileStat = await stat(absolutePath);

  return {
    absolutePath,
    relativePath: relative(workspaceRoot, absolutePath).replaceAll("\\", "/"),
    sizeBytes: fileStat.size,
    mtimeMs: fileStat.mtimeMs
  };
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
}
