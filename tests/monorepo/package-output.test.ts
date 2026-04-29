import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");

describe("workspace package output", () => {
  it("packs only dist files from app and package workspaces", () => {
    for (const packageJsonPath of workspacePackageJsonPaths()) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
        files?: string[];
        name?: string;
        version?: string;
      };

      expect(packageJson.version, packageJson.name).toMatch(
        /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
      );
      expect(packageJson.files, packageJson.name).toEqual(["dist"]);
    }
  });
});

function workspacePackageJsonPaths(): string[] {
  return ["apps", "packages"].flatMap((workspaceDir) => {
    const absoluteDir = join(repoRoot, workspaceDir);

    return readdirSync(absoluteDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(absoluteDir, entry.name, "package.json"));
  });
}
