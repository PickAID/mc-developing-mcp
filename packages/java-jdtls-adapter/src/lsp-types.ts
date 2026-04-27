export interface LspPosition {
  line: number;
  character: number;
}

export interface LspTextDocumentIdentifier {
  uri: string;
}

export interface LspTextDocumentPositionParams {
  textDocument: LspTextDocumentIdentifier;
  position: LspPosition;
}

export interface LspReferenceParams extends LspTextDocumentPositionParams {
  context: {
    includeDeclaration: boolean;
  };
}

export interface JdtlsInitializeResult {
  capabilities?: Record<string, unknown>;
  serverInfo?: {
    name: string;
    version?: string;
  };
}

export interface LspPublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}

export interface LspDiagnostic {
  message: string;
  severity?: number;
  range?: {
    start: LspPosition;
    end: LspPosition;
  };
  code?: string | number;
  source?: string;
}
