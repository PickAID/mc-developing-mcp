import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildAgentRuntimeBootstrap } from "./bootstrap.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("buildAgentRuntimeBootstrap", () => {
  it("keeps the legacy string bootstrap API compatible", () => {
    const bootstrap = buildAgentRuntimeBootstrap("/tmp/mcpskill-runtime");

    expect(bootstrap.appId).toBe("agent-runtime");
    expect(bootstrap.harnessPackage).toBe("@mcpskill/agent-harness");
    expect(bootstrap.traceEnabled).toBe(true);
    expect(bootstrap.runtimePolicy.runtimeRoot).toBe("/tmp/mcpskill-runtime");
    expect(bootstrap.runtimePolicy.allowSystemFallback).toBe(false);
    expect(bootstrap.workspaceContext).toBeUndefined();
    expect(bootstrap.defaultRoutePlan).toBeUndefined();
    expect(bootstrap.harnessSnapshot).toBeUndefined();
    expect(bootstrap.harnessBrief).toBeUndefined();
  });

  it("attaches detected workspace context, route data, and a harness brief when a workspace root is provided", async () => {
    const workspaceRoot = createForgeWorkspace();

    const bootstrap = await buildAgentRuntimeBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot
      }
    });

    expect(bootstrap.workspaceContext).toMatchObject({
      workspaceRoot,
      detectorPackage: "@mcpskill/workspace-detector",
      descriptor: {
        kind: "java-mod",
        hasGradle: true,
        currentRuntime: {
          minecraftVersion: "1.20.1",
          loader: "forge",
          confidence: "high"
        }
      }
    });
    expect(bootstrap.defaultRoutePlan).toEqual({
      scenario: "java-mod-workspace",
      reasons: [
        "workspace descriptor reports a Java mod workspace",
        "default project-symbol routing should inspect workspace source before docs"
      ],
      defaultRoutingScenario: "project_symbol",
      steps: ["workspace_source", "docs_lookup"]
    });
    expect(bootstrap.harnessSnapshot).toMatchObject({
      workspaceRoot,
      workspaceKind: "java-mod",
      routePlan: {
        scenario: "java-mod-workspace",
        defaultRoutingScenario: "project_symbol",
        steps: ["workspace_source", "docs_lookup"]
      },
      facts: {
        hasGradle: true,
        hasJavaSource: true,
        buildFileCount: 1,
        javaSourceRootCount: 1
      }
    });
    expect(bootstrap.harnessBrief).toMatchObject({
      snapshot: {
        workspaceRoot,
        workspaceKind: "java-mod"
      },
      availableTools: [
        "workspace.analyze",
        "source.bundle",
        "context.query",
        "migration.analyze"
      ],
      preferredTools: ["source.bundle", "context.query", "workspace.analyze"],
      promptFragments: [
        {
          id: "workspace_summary"
        },
        {
          id: "route_policy",
          text: "Default route: project_symbol via workspace_source -> docs_lookup."
        },
        {
          id: "tool_policy",
          text: "Preferred internal routes: source.bundle -> context.query -> workspace.analyze. Use migration.analyze only for explicit version migration requests."
        }
      ]
    });
  });

  it("propagates KubeJS authoring policy through snapshot and brief for KubeJS workspaces", async () => {
    const workspaceRoot = createKubejsWorkspace();

    const bootstrap = await buildAgentRuntimeBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot
      }
    });

    expect(bootstrap.workspaceContext).toMatchObject({
      workspaceRoot,
      descriptor: {
        kind: "kubejs",
        hasKubeJS: true,
        hasProbeJS: true
      }
    });
    expect(bootstrap.harnessSnapshot).toMatchObject({
      workspaceRoot,
      workspaceKind: "kubejs",
      routePlan: {
        scenario: "kubejs-workspace",
        defaultRoutingScenario: "kubejs_script",
        steps: ["probejs_types", "docs_lookup"]
      },
      authoringPolicy: {
        profile: "kubejs_script",
        preferredSignalOrder: [
          "probejs_types",
          "workspace_facts",
          "modding_docs"
        ]
      }
    });
    expect(bootstrap.harnessBrief).toMatchObject({
      authoringPolicy: {
        profile: "kubejs_script"
      },
      preferredTools: ["context.query", "source.bundle", "workspace.analyze"],
      promptFragments: [
        {
          id: "workspace_summary"
        },
        {
          id: "route_policy",
          text: "Default route: kubejs_script via probejs_types -> docs_lookup."
        },
        {
          id: "tool_policy",
          text: "Preferred internal routes: context.query -> source.bundle -> workspace.analyze. Use migration.analyze only for explicit version migration requests."
        },
        {
          id: "kubejs_authoring_policy",
          text: expect.stringContaining("KubeJS authoring policy:")
        }
      ]
    });
  });
});

function createForgeWorkspace(): string {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), "mcpskill-agent-runtime-bootstrap-")
  );
  tempRoots.push(workspaceRoot);
  const metaInfRoot = join(
    workspaceRoot,
    "src",
    "main",
    "resources",
    "META-INF"
  );

  mkdirSync(metaInfRoot, { recursive: true });
  mkdirSync(join(workspaceRoot, "src", "main", "java", "example"), {
    recursive: true
  });
  writeFileSync(
    join(workspaceRoot, "build.gradle"),
    [
      'plugins { id "net.minecraftforge.gradle" }',
      "dependencies {",
      '  minecraft "net.minecraftforge:forge:1.20.1-47.2.0"',
      "}"
    ].join("\n")
  );
  writeFileSync(
    join(metaInfRoot, "mods.toml"),
    ['modLoader="javafml"', 'loaderVersion="[47,)"'].join("\n")
  );

  return workspaceRoot;
}

function createKubejsWorkspace(): string {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), "mcpskill-agent-runtime-kubejs-")
  );
  tempRoots.push(workspaceRoot);

  mkdirSync(join(workspaceRoot, "kubejs", "startup_scripts"), {
    recursive: true
  });
  mkdirSync(join(workspaceRoot, ".probejs"), { recursive: true });
  writeFileSync(
    join(workspaceRoot, "kubejs", "startup_scripts", "main.js"),
    "ServerEvents.recipes(event => {})\n"
  );
  writeFileSync(
    join(workspaceRoot, ".probejs", "manifest.json"),
    JSON.stringify({ generatedAt: "2026-04-21T00:00:00Z" })
  );

  return workspaceRoot;
}
