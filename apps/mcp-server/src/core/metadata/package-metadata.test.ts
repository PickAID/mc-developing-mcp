import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { MCP_SERVER_VERSION } from "./server-metadata.js";

describe("minecraft-developing-mcp package metadata", () => {
  it("publishes a stdio binary for local MCP clients", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf-8")
    ) as {
      bin?: Record<string, string>;
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
      types?: string;
      version?: string;
    };

    expect(packageJson.bin).toEqual({
      "mc-developing-mcp": "dist/stdio.js"
    });
    expect(packageJson.types).toBeUndefined();
    expect(Object.keys(packageJson.dependencies ?? {})).not.toContain(
      expect.stringMatching(/^(?:@mcpskill\/|minecraft-developing-mcp-)/)
    );
    expect(packageJson.scripts?.test).toContain("tsc -b .");
    expect(packageJson.scripts?.test).toContain('"$PWD/src"');
    expect(MCP_SERVER_VERSION).toBe(packageJson.version);
  });
});
