import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("@mcpskill/mcp-server package metadata", () => {
  it("publishes a stdio binary for local MCP clients", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf-8")
    ) as { bin?: Record<string, string>; scripts?: Record<string, string> };

    expect(packageJson.bin).toEqual({
      "mc-developing-mcp": "./dist/stdio.js"
    });
    expect(packageJson.scripts?.test).toContain("stdio-subprocess.test.ts");
    expect(packageJson.scripts?.test).toContain("mcp-structured-content.test.ts");
    expect(packageJson.scripts?.test).toContain(
      "java-diagnostics-runtime.test.ts"
    );
  });
});
