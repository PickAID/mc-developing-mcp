import { describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { MC_DEVELOP_TOOL_NAME } from "./mcp-tools.js";
import { createMcpSkillServer } from "./mcp-server.js";
import type { McpJavaDiagnosticsRuntime } from "./java-diagnostics-runtime.js";

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
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        }
      });
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("stops the Java diagnostics runtime when the server closes", async () => {
    let stopCalls = 0;
    const javaDiagnosticsRuntime: McpJavaDiagnosticsRuntime = {
      async prepare() {
        throw new Error("prepare should not be called");
      },
      async stopAll() {
        stopCalls += 1;
      }
    };
    const server = createMcpSkillServer({ javaDiagnosticsRuntime });

    await server.close();
    await server.close();

    expect(stopCalls).toBe(1);
  });

  it("awaits Java diagnostics cleanup for concurrent server closes", async () => {
    let releaseStopAllStarted!: () => void;
    let releaseStopAll!: () => void;
    let secondCloseSettled = false;
    let stopCalls = 0;
    const stopAllStarted = new Promise<void>((release) => {
      releaseStopAllStarted = release;
    });
    const stopAllReleased = new Promise<void>((release) => {
      releaseStopAll = release;
    });
    const javaDiagnosticsRuntime: McpJavaDiagnosticsRuntime = {
      async prepare() {
        throw new Error("prepare should not be called");
      },
      async stopAll() {
        stopCalls += 1;
        releaseStopAllStarted();
        await stopAllReleased;
      }
    };
    const server = createMcpSkillServer({ javaDiagnosticsRuntime });

    const firstClose = server.close();
    await stopAllStarted;
    const secondClose = server.close();
    const trackedSecondClose = secondClose.then(() => {
      secondCloseSettled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secondCloseSettled).toBe(false);

    releaseStopAll();
    await Promise.all([firstClose, trackedSecondClose]);

    expect(stopCalls).toBe(1);
  });
});
