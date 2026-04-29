import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("workspace foundation", () => {
  it("declares pnpm workspaces for apps and packages", () => {
    const workspaceYaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf-8");
    expect(workspaceYaml).toContain('  - "apps/*"');
    expect(workspaceYaml).toContain('  - "packages/*"');
  });

  it("creates the phase-1 app and package roots", () => {
    const expectedPaths = [
      "apps/agent-runtime/package.json",
      "apps/mcp-server/package.json",
      "packages/shared-types/package.json",
      "packages/runtime-manager/package.json",
      "packages/source-package-manager/package.json",
      "packages/resource-registry/package.json",
      "packages/vanilla-source-adapter/package.json",
      "packages/agent-harness/package.json",
      "packages/eval-harness/package.json",
      "packages/workspace-detector/package.json",
      "packages/java-jdtls-adapter/package.json",
      "packages/gradle-adapter/package.json",
      "packages/jar-source-adapter/package.json",
      "packages/kubejs-types-adapter/package.json",
      "packages/datapack-adapter/package.json",
      "packages/docs-retrieval/package.json",
      "packages/package-registry/package.json"
    ];

    for (const relPath of expectedPaths) {
      expect(existsSync(join(repoRoot, relPath)), relPath).toBe(true);
    }
  });
});
