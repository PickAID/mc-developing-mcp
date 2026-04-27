import { PassThrough } from "node:stream";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  JsonRpcStdioClient,
  encodeJsonRpcMessage
} from "./json-rpc-client.js";
import { createJdtlsSession } from "./jdtls-session.js";

describe("createJdtlsSession", () => {
  it("initializes, performs workspace symbol lookup, and shuts down over JSON-RPC", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jdtls-session-"));
    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();
    const client = new JsonRpcStdioClient({
      reader: serverToClient,
      writer: clientToServer,
      requestTimeoutMs: 500
    });
    const messages = new JsonRpcMessageRecorder(clientToServer);
    const session = createJdtlsSession({
      client,
      workspaceRoot,
      processId: 1234
    });
    const diagnostics = new Promise((resolve) => session.onDiagnostics(resolve));

    serverToClient.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: {
          uri: `file://${workspaceRoot}/src/main/java/demo/Example.java`,
          diagnostics: [{ message: "broken" }]
        }
      })
    );

    await expect(diagnostics).resolves.toMatchObject({
      diagnostics: [{ message: "broken" }]
    });

    const initialize = session.initialize();
    const initializeRequest = await messages.next();
    expect(initializeRequest).toMatchObject({
      method: "initialize",
      params: {
        processId: 1234,
        rootUri: `file://${workspaceRoot}`
      }
    });

    serverToClient.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: initializeRequest.id,
        result: { capabilities: { hoverProvider: true } }
      })
    );

    await expect(initialize).resolves.toMatchObject({
      capabilities: { hoverProvider: true }
    });
    expect(await messages.next()).toMatchObject({
      method: "initialized",
      params: {}
    });

    const symbols = session.workspaceSymbol("ItemStack");
    const symbolRequest = await messages.next();
    expect(symbolRequest).toMatchObject({
      method: "workspace/symbol",
      params: { query: "ItemStack" }
    });
    serverToClient.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: symbolRequest.id,
        result: [{ name: "ItemStack", kind: 5 }]
      })
    );
    await expect(symbols).resolves.toEqual([{ name: "ItemStack", kind: 5 }]);

    const shutdown = session.shutdown();
    const shutdownRequest = await messages.next();
    expect(shutdownRequest).toMatchObject({ method: "shutdown" });
    serverToClient.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: shutdownRequest.id,
        result: null
      })
    );
    await shutdown;
    expect(await messages.next()).toMatchObject({
      method: "exit"
    });

    client.dispose();
  });
});

class JsonRpcMessageRecorder {
  private buffer = Buffer.alloc(0);
  private readonly messages: Array<Record<string, unknown>> = [];
  private readonly waiters: Array<(message: Record<string, unknown>) => void> = [];

  constructor(stream: PassThrough) {
    stream.on("data", (chunk: Buffer) => this.acceptChunk(chunk));
  }

  next(): Promise<Record<string, unknown>> {
    const message = this.messages.shift();
    if (message) {
      return Promise.resolve(message);
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private acceptChunk(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    for (;;) {
      const raw = this.buffer.toString("utf8");
      const separator = raw.indexOf("\r\n\r\n");

      if (separator < 0) {
        return;
      }

      const header = raw.slice(0, separator);
      const length = Number(header.match(/Content-Length: (\d+)/i)?.[1]);
      const body = raw.slice(separator + 4);

      if (Buffer.byteLength(body, "utf8") < length) {
        return;
      }

      this.buffer = Buffer.from(body.slice(length), "utf8");
      this.push(JSON.parse(body.slice(0, length)) as Record<string, unknown>);
    }
  }

  private push(message: Record<string, unknown>): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(message);
      return;
    }

    this.messages.push(message);
  }
}
