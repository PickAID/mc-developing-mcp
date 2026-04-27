import type { JdtlsOperationContract, JdtlsOperationName } from "./types.js";

export const SUPPORTED_JDTLS_OPERATIONS = [
  "definition",
  "references",
  "hover",
  "workspaceSymbol",
  "diagnostics"
] as const satisfies readonly JdtlsOperationName[];

export const JDTLS_OPERATION_CONTRACTS = [
  {
    operation: "definition",
    lspMethod: "textDocument/definition",
    implemented: true
  },
  {
    operation: "references",
    lspMethod: "textDocument/references",
    implemented: true
  },
  {
    operation: "hover",
    lspMethod: "textDocument/hover",
    implemented: true
  },
  {
    operation: "workspaceSymbol",
    lspMethod: "workspace/symbol",
    implemented: true
  },
  {
    operation: "diagnostics",
    lspMethod: "textDocument/publishDiagnostics",
    implemented: true
  }
] as const satisfies readonly JdtlsOperationContract[];
