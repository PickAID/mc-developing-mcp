import type { Readable, Writable } from "node:stream";

export type JsonRpcId = number | string;

export interface JsonRpcRequestMessage {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotificationMessage {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccessResponseMessage {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorResponseMessage {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcIncomingMessage =
  | JsonRpcNotificationMessage
  | JsonRpcSuccessResponseMessage
  | JsonRpcErrorResponseMessage;

export type JsonRpcNotificationHandler = (params: unknown) => void;

export interface JsonRpcStdioClientOptions {
  reader: Readable;
  writer: Writable;
  requestTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  timer: NodeJS.Timeout;
}

const HEADER_SEPARATOR = Buffer.from("\r\n\r\n");
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class JsonRpcResponseError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(error: { code: number; message: string; data?: unknown }) {
    super(error.message);
    this.name = "JsonRpcResponseError";
    this.code = error.code;
    this.data = error.data;
  }
}

export class JsonRpcStdioClient {
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationHandlers = new Map<
    string,
    Set<JsonRpcNotificationHandler>
  >();
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: JsonRpcStdioClientOptions) {
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.options.reader.on("data", (chunk: Buffer) => this.acceptChunk(chunk));
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId;
    this.nextId += 1;
    const message: JsonRpcRequestMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    this.options.writer.write(encodeJsonRpcMessage(message));

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`JSON-RPC request timed out: ${method}`));
      }, this.requestTimeoutMs);

      this.pending.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timer
      });
    });
  }

  notify(method: string, params?: unknown): void {
    this.options.writer.write(
      encodeJsonRpcMessage({
        jsonrpc: "2.0",
        method,
        params
      })
    );
  }

  onNotification(method: string, handler: JsonRpcNotificationHandler): void {
    const handlers = this.notificationHandlers.get(method) ?? new Set();
    handlers.add(handler);
    this.notificationHandlers.set(method, handlers);
  }

  acceptMessage(message: JsonRpcIncomingMessage): void {
    if ("method" in message) {
      this.dispatchNotification(message);
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(message.id);

    if ("error" in message) {
      pending.reject(new JsonRpcResponseError(message.error));
      return;
    }

    pending.resolve(message.result);
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("JSON-RPC client disposed."));
    }
    this.pending.clear();
    this.notificationHandlers.clear();
  }

  private acceptChunk(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    for (;;) {
      const separatorIndex = this.buffer.indexOf(HEADER_SEPARATOR);
      if (separatorIndex < 0) {
        return;
      }

      const header = this.buffer.subarray(0, separatorIndex).toString("ascii");
      const contentLength = parseContentLength(header);
      const bodyStart = separatorIndex + HEADER_SEPARATOR.length;
      const bodyEnd = bodyStart + contentLength;

      if (this.buffer.length < bodyEnd) {
        return;
      }

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.subarray(bodyEnd);
      this.acceptMessage(JSON.parse(body) as JsonRpcIncomingMessage);
    }
  }

  private dispatchNotification(message: JsonRpcNotificationMessage): void {
    const handlers = this.notificationHandlers.get(message.method);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(message.params);
    }
  }
}

export function encodeJsonRpcMessage(message: object): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");

  return Buffer.concat([header, body]);
}

function parseContentLength(header: string): number {
  const match = header.match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);

  if (!match) {
    throw new Error("JSON-RPC message is missing Content-Length header.");
  }

  return Number(match[1]);
}
