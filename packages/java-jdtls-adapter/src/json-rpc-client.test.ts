import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  JsonRpcResponseError,
  JsonRpcStdioClient,
  encodeJsonRpcMessage
} from "./json-rpc-client.js";

describe("JsonRpcStdioClient", () => {
  it("sends framed requests and resolves matching responses", async () => {
    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();
    const client = new JsonRpcStdioClient({
      reader: serverToClient,
      writer: clientToServer,
      requestTimeoutMs: 500
    });

    const pending = client.request("workspace/symbol", { query: "ItemStack" });
    const request = await readOneJsonRpcMessage(clientToServer);

    expect(request).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      method: "workspace/symbol",
      params: { query: "ItemStack" }
    });

    serverToClient.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: request.id,
        result: [{ name: "ItemStack", kind: 5 }]
      })
    );

    await expect(pending).resolves.toEqual([{ name: "ItemStack", kind: 5 }]);
    client.dispose();
  });

  it("routes server notifications to registered handlers", async () => {
    const client = new JsonRpcStdioClient({
      reader: new PassThrough(),
      writer: new PassThrough(),
      requestTimeoutMs: 500
    });
    const diagnostics = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", resolve);
    });

    client.acceptMessage({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: {
        uri: "file:///workspace/src/main/java/demo/Example.java",
        diagnostics: [{ message: "broken", severity: 1 }]
      }
    });

    await expect(diagnostics).resolves.toMatchObject({
      diagnostics: [{ message: "broken", severity: 1 }]
    });
    client.dispose();
  });

  it("rejects JSON-RPC error responses", async () => {
    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();
    const client = new JsonRpcStdioClient({
      reader: serverToClient,
      writer: clientToServer,
      requestTimeoutMs: 500
    });

    const pending = client.request("textDocument/hover", {});
    const request = await readOneJsonRpcMessage(clientToServer);

    serverToClient.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32602,
          message: "Invalid params"
        }
      })
    );

    await expect(pending).rejects.toBeInstanceOf(JsonRpcResponseError);
    client.dispose();
  });
});

async function readOneJsonRpcMessage(stream: PassThrough): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  return new Promise((resolve) => {
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
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

      resolve(JSON.parse(body.slice(0, length)) as Record<string, unknown>);
    });
  });
}
