import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");
const mcpServerRoot = join(repoRoot, "apps", "mcp-server");
const srcRoot = join(mcpServerRoot, "src");
const distRoot = join(mcpServerRoot, "dist");

const structuredSourceDirs = [
  "client-visual",
  "core",
  "crash",
  "docs",
  "external-mod",
  "gradle",
  "java",
  "mod-archive",
  "probejs",
  "request",
  "smoke",
  "source-bundle"
];

describe("minecraft-developing-mcp-mcp-server source layout", () => {
  it("keeps the src root limited to stable entrypoints", () => {
    expect(tsFilesAt(srcRoot).sort()).toEqual(["index.ts", "stdio.ts"]);
  });

  it("keeps structured domain roots free of direct implementation files", () => {
    for (const dir of structuredSourceDirs) {
      expect(tsFilesAt(join(srcRoot, dir)), dir).toEqual([]);
    }
  });

  it("keeps mcp-server subdirectories small enough to maintain", () => {
    const groups = sourceGroups();

    expect(groups.get("<root>")).toBe(2);
    expect(Math.max(...groups.values())).toBeLessThanOrEqual(12);
  });

  it("does not leave tests or stale root-level implementation files in dist", () => {
    if (!existsSync(distRoot)) {
      return;
    }

    const distFiles = walkFiles(distRoot).map((file) =>
      relative(distRoot, file).split("/").join("/")
    );
    const forbiddenTestOutputs = distFiles.filter(
      (file) =>
        file.endsWith(".test.js") ||
        file.endsWith(".test.d.ts") ||
        file.endsWith(".test-support.js") ||
        file.endsWith(".test-support.d.ts")
    );
    const staleRootOutputs = distFiles.filter(
      (file) =>
        !file.includes("/") &&
        !file.startsWith("index.") &&
        !file.startsWith("stdio.")
    );

    expect(forbiddenTestOutputs).toEqual([]);
    expect(staleRootOutputs).toEqual([]);
  });
});

function sourceGroups(): Map<string, number> {
  const groups = new Map<string, number>();

  for (const file of walkFiles(srcRoot).filter((file) => file.endsWith(".ts"))) {
    const parts = relative(srcRoot, file).split("/");
    const group =
      parts.length === 1 ? "<root>" : parts.length === 2 ? parts[0] : `${parts[0]}/${parts[1]}`;

    groups.set(group, (groups.get(group) ?? 0) + 1);
  }

  return groups;
}

function tsFilesAt(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name);
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);

    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}
