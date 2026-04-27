import { PassThrough } from "node:stream";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { createLspDiagnosticRegistry } from "./diagnostic-registry.js";
import { createJdtlsManager } from "./jdtls-manager.js";
import {
  JsonRpcStdioClient,
  encodeJsonRpcMessage
} from "./json-rpc-client.js";
import { createJdtlsSession, type JdtlsSession } from "./jdtls-session.js";

describe("createJdtlsManager", () => {
  it("registers diagnostics and emits file sync notifications through the session", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-jdtls-manager-"));
    const filePath = join(workspaceRoot, "src", "main", "java", "demo", "Example.java");
    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();
    const messages = new JsonRpcMessageRecorder(clientToServer);
    const client = new JsonRpcStdioClient({
      reader: serverToClient,
      writer: clientToServer,
      requestTimeoutMs: 500
    });
    const diagnostics = createLspDiagnosticRegistry();
    const manager = createJdtlsManager({
      session: createJdtlsSession({ client, workspaceRoot }),
      diagnostics
    });

    const starting = manager.start();
    const initializeRequest = await messages.next();
    serverToClient.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: initializeRequest.id,
        result: { capabilities: {} }
      })
    );
    await starting;
    await manager.ready();
    await messages.next();

    serverToClient.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: {
          uri: `file://${filePath}`,
          diagnostics: [{ message: "broken", severity: 1 }]
        }
      })
    );

    expect(diagnostics.drainPending()).toEqual([
      {
        uri: `file://${filePath}`,
        diagnostics: [{ message: "broken", severity: 1 }]
      }
    ]);

    manager.didOpenJavaFile({
      filePath,
      text: "package demo;\nclass Example {}\n",
      version: 1
    });
    expect(await messages.next()).toMatchObject({
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri: `file://${filePath}`,
          languageId: "java",
          version: 1,
          text: "package demo;\nclass Example {}\n"
        }
      }
    });

    manager.didChangeJavaFile({
      filePath,
      text: "package demo;\nclass Example { int value; }\n",
      version: 2
    });
    expect(await messages.next()).toMatchObject({
      method: "textDocument/didChange",
      params: {
        textDocument: {
          uri: `file://${filePath}`,
          version: 2
        },
        contentChanges: [
          {
            text: "package demo;\nclass Example { int value; }\n"
          }
        ]
      }
    });

    const stopping = manager.stop();
    const shutdownRequest = await messages.next();
    expect(shutdownRequest).toMatchObject({ method: "shutdown" });
    serverToClient.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: shutdownRequest.id,
        result: null
      })
    );
    await stopping;
    expect(await messages.next()).toMatchObject({ method: "exit" });

    client.dispose();
  });

  it("can assign Java file sync versions inside the manager", () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const filePath = "/workspace/src/main/java/demo/Example.java";
    const session: JdtlsSession = {
      initialize: async () => ({ capabilities: {} }),
      shutdown: async () => {},
      workspaceSymbol: async () => [],
      hover: async () => undefined,
      definition: async () => undefined,
      references: async () => [],
      onDiagnostics: () => {},
      didOpen: (input) => calls.push({ method: "didOpen", input }),
      didChange: (input) => calls.push({ method: "didChange", input }),
      didSave: (input) => calls.push({ method: "didSave", input }),
      didClose: (input) => calls.push({ method: "didClose", input })
    };

    const manager = createJdtlsManager({
      session,
      diagnostics: createLspDiagnosticRegistry()
    });

    manager.didOpenJavaFileAutoVersion({
      filePath,
      text: "package demo;\nclass Example {}\n"
    });
    manager.didChangeJavaFileAutoVersion({
      filePath,
      text: "package demo;\nclass Example { int value; }\n"
    });
    manager.didCloseJavaFile(filePath);
    manager.didOpenJavaFileAutoVersion({
      filePath,
      text: "package demo;\nclass Example {}\n"
    });

    expect(calls).toMatchObject([
      {
        method: "didOpen",
        input: { filePath, languageId: "java", version: 1 }
      },
      {
        method: "didChange",
        input: { filePath, version: 2 }
      },
      {
        method: "didClose",
        input: { filePath }
      },
      {
        method: "didOpen",
        input: { filePath, languageId: "java", version: 1 }
      }
    ]);
  });

  it("rejects auto-versioned Java changes before a file is opened", () => {
    const filePath = "/workspace/src/main/java/demo/Example.java";
    const session: JdtlsSession = {
      initialize: async () => ({ capabilities: {} }),
      shutdown: async () => {},
      workspaceSymbol: async () => [],
      hover: async () => undefined,
      definition: async () => undefined,
      references: async () => [],
      onDiagnostics: () => {},
      didOpen: () => {},
      didChange: () => {
        throw new Error("should not send didChange");
      },
      didSave: () => {},
      didClose: () => {}
    };

    const manager = createJdtlsManager({
      session,
      diagnostics: createLspDiagnosticRegistry()
    });

    expect(() =>
      manager.didChangeJavaFileAutoVersion({
        filePath,
        text: "package demo;\nclass Example { int value; }\n"
      })
    ).toThrow(
      "Cannot send auto-versioned didChange before didOpen for Java file."
    );
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
