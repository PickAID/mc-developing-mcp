import { describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { MC_DEVELOP_TOOL_NAME } from "./mcp-tools.js";
import { createMcpSkillServer } from "./mcp-server.js";

describe("createMcpSkillServer", () => {
  it("exposes only the progressive high-level Minecraft development tool", async () => {
    const server = createMcpSkillServer();
    const client = new Client({ name: "mcpskill-test-client", version: "0.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);

    try {
      const tools = await client.listTools();

      expect(tools.tools.map((tool) => tool.name)).toEqual([
        MC_DEVELOP_TOOL_NAME
      ]);
      expect(tools.tools[0]).toMatchObject({
        title: "Minecraft Development Assistant",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false
        }
      });
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
