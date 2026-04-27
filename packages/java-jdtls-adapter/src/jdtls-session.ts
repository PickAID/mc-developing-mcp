import { pathToFileURL } from "node:url";

import type { JsonRpcStdioClient } from "./json-rpc-client.js";
import type {
  JdtlsInitializeResult,
  LspPublishDiagnosticsParams,
  LspReferenceParams,
  LspTextDocumentPositionParams
} from "./lsp-types.js";

export interface JdtlsSessionOptions {
  client: JsonRpcStdioClient;
  workspaceRoot: string;
  processId?: number | null;
  capabilities?: Record<string, unknown>;
  initializationOptions?: unknown;
}

export interface TextDocumentPositionInput {
  filePath: string;
  line: number;
  character: number;
}

export interface ReferenceInput extends TextDocumentPositionInput {
  includeDeclaration?: boolean;
}

export interface DidOpenTextDocumentInput {
  filePath: string;
  languageId: string;
  text: string;
  version: number;
}

export interface DidChangeTextDocumentInput {
  filePath: string;
  text: string;
  version: number;
}

export interface DidSaveTextDocumentInput {
  filePath: string;
  text?: string;
}

export interface DidCloseTextDocumentInput {
  filePath: string;
}

export interface JdtlsSession {
  initialize(): Promise<JdtlsInitializeResult>;
  shutdown(): Promise<void>;
  workspaceSymbol(query: string): Promise<unknown>;
  hover(input: TextDocumentPositionInput): Promise<unknown>;
  definition(input: TextDocumentPositionInput): Promise<unknown>;
  references(input: ReferenceInput): Promise<unknown>;
  onDiagnostics(handler: (params: LspPublishDiagnosticsParams) => void): void;
  didOpen(input: DidOpenTextDocumentInput): void;
  didChange(input: DidChangeTextDocumentInput): void;
  didSave(input: DidSaveTextDocumentInput): void;
  didClose(input: DidCloseTextDocumentInput): void;
}

export function createJdtlsSession(options: JdtlsSessionOptions): JdtlsSession {
  return {
    async initialize() {
      const result = await options.client.request<JdtlsInitializeResult>(
        "initialize",
        {
          processId: options.processId ?? null,
          rootUri: pathToFileURL(options.workspaceRoot).href.replace(/\/$/, ""),
          capabilities: options.capabilities ?? {},
          initializationOptions: options.initializationOptions
        }
      );

      options.client.notify("initialized", {});

      return result;
    },

    async shutdown() {
      await options.client.request("shutdown", null);
      options.client.notify("exit");
    },

    workspaceSymbol(query: string) {
      return options.client.request("workspace/symbol", { query });
    },

    hover(input: TextDocumentPositionInput) {
      return options.client.request(
        "textDocument/hover",
        buildTextDocumentPositionParams(input)
      );
    },

    definition(input: TextDocumentPositionInput) {
      return options.client.request(
        "textDocument/definition",
        buildTextDocumentPositionParams(input)
      );
    },

    references(input: ReferenceInput) {
      return options.client.request("textDocument/references", {
        ...buildTextDocumentPositionParams(input),
        context: {
          includeDeclaration: input.includeDeclaration ?? false
        }
      } satisfies LspReferenceParams);
    },

    onDiagnostics(handler: (params: LspPublishDiagnosticsParams) => void) {
      options.client.onNotification("textDocument/publishDiagnostics", (params) =>
        handler(params as LspPublishDiagnosticsParams)
      );
    },

    didOpen(input: DidOpenTextDocumentInput) {
      options.client.notify("textDocument/didOpen", {
        textDocument: {
          uri: filePathToUri(input.filePath),
          languageId: input.languageId,
          version: input.version,
          text: input.text
        }
      });
    },

    didChange(input: DidChangeTextDocumentInput) {
      options.client.notify("textDocument/didChange", {
        textDocument: {
          uri: filePathToUri(input.filePath),
          version: input.version
        },
        contentChanges: [
          {
            text: input.text
          }
        ]
      });
    },

    didSave(input: DidSaveTextDocumentInput) {
      options.client.notify("textDocument/didSave", {
        textDocument: {
          uri: filePathToUri(input.filePath)
        },
        text: input.text
      });
    },

    didClose(input: DidCloseTextDocumentInput) {
      options.client.notify("textDocument/didClose", {
        textDocument: {
          uri: filePathToUri(input.filePath)
        }
      });
    }
  };
}

function buildTextDocumentPositionParams(
  input: TextDocumentPositionInput
): LspTextDocumentPositionParams {
  return {
    textDocument: {
      uri: pathToFileURL(input.filePath).href
    },
    position: {
      line: input.line,
      character: input.character
    }
  };
}

function filePathToUri(filePath: string): string {
  return pathToFileURL(filePath).href;
}
