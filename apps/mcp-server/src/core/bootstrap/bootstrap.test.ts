import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildMcpServerBootstrap } from "./bootstrap.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("buildMcpServerBootstrap", () => {
  it("keeps the legacy string bootstrap API compatible", () => {
    const bootstrap = buildMcpServerBootstrap("/tmp/mcpskill-runtime");

    expect(bootstrap.appId).toBe("mcp-server");
    expect(bootstrap.runtimePolicy.runtimeRoot).toBe("/tmp/mcpskill-runtime");
    expect(bootstrap.runtimePolicy.runtimeVersion).toBe("0.1.3");
    expect(bootstrap.runtimePolicy.mode).toBe("managed-first");
    expect(bootstrap.runtimePolicy.requiredArtifacts.map((item) => item.id)).toEqual(
      ["jdk", "jdtls", "gradle-support"]
    );
    expect(bootstrap.corePackages).toEqual([
      "minecraft-developing-mcp-agent-harness",
      "minecraft-developing-mcp-runtime-manager",
      "minecraft-developing-mcp-shared-types",
      "minecraft-developing-mcp-workspace-detector"
    ]);
    expect(bootstrap.workspaceContext).toBeUndefined();
  });

  it("attaches detected workspace context when a workspace root is provided", async () => {
    const workspaceRoot = createDatapackWorkspace();

    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime",
      workspace: {
        workspaceRoot
      }
    });

    expect(bootstrap.workspaceContext).toMatchObject({
      workspaceRoot,
      detectorPackage: "minecraft-developing-mcp-workspace-detector",
      descriptor: {
        hasDatapack: true,
        currentRuntime: {
          minecraftVersion: "1.20.1",
          confidence: "medium"
        }
      }
    });
  });
});

function createDatapackWorkspace(): string {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), "mcpskill-mcp-server-bootstrap-")
  );
  tempRoots.push(workspaceRoot);
  const resourceRoot = join(workspaceRoot, "src", "main", "resources");

  mkdirSync(join(resourceRoot, "data", "example"), { recursive: true });
  writeFileSync(
    join(resourceRoot, "pack.mcmeta"),
    JSON.stringify({
      pack: {
        pack_format: 15
      }
    })
  );

  return workspaceRoot;
}
