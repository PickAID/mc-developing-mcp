import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { buildMcpServerPromptAssembly } from "../../core/bootstrap/prompt-assembly.js";
import { buildMcpServerRequestContextWithServiceProfile } from "./service-profile-context.js";

describe("buildMcpServerRequestContextWithServiceProfile", () => {
  it("injects service-profile guidance into the prompt fragments without expanding public tools", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-mcp-profile-"));
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-mcp-runtime-"));

    await mkdir(join(workspaceRoot, "kubejs"), { recursive: true });
    await mkdir(join(workspaceRoot, ".probejs"), { recursive: true });
    await mkdir(join(workspaceRoot, "data", "demo", "recipes"), {
      recursive: true
    });
    await writeFile(join(workspaceRoot, "build.gradle"), "minecraft_version='1.20.1'\n");
    await writeFile(join(workspaceRoot, ".probejs", "global.d.ts"), "declare const Item: unknown;\n");
    await writeFile(join(workspaceRoot, "data", "demo", "recipes", "x.json"), "{}\n");

    const context = await buildMcpServerRequestContextWithServiceProfile(
      {
        workspaceContext: {
          workspaceRoot,
          detectorPackage: "@mcpskill/workspace-detector",
          descriptor: {
            root: workspaceRoot,
            kind: "modpack",
            hasGradle: true,
            hasKubeJS: true,
            hasProbeJS: true,
            hasModArchives: false,
            hasJavaSource: false,
            hasDatapack: true,
            buildFiles: [join(workspaceRoot, "build.gradle")],
            javaSourceRoots: [],
            modArchivePaths: [],
            datapackRoots: [workspaceRoot],
            logPaths: [],
            reasons: ["fixture"],
            currentRuntime: {
              minecraftVersion: "1.20.1",
              source: "workspace-detect",
              confidence: "high",
              evidenceSources: ["fixture"],
              candidates: [],
              evidence: []
            }
          }
        }
      },
      {
        requestText: "add a KubeJS recipe",
        runtimeRoot,
        includeDefaultGradleUserHome: false,
        executableResolver: async () => undefined,
        env: {}
      }
    );

    expect(context.taskBrief.promptFragments.map((fragment) => fragment.id)).toContain(
      "service_profile"
    );
    expect(context.taskBrief.availableTools).toEqual([
      "workspace.analyze",
      "source.bundle",
      "context.query",
      "migration.analyze"
    ]);
    expect(buildMcpServerPromptAssembly(context).text).toContain(
      "[Service Profile]\n"
    );
    expect(buildMcpServerPromptAssembly(context).text).toContain(
      "ProbeJS types: ready"
    );
  });
});
