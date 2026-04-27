export const JAVA_JDTLS_ADAPTER_PACKAGE = "@mcpskill/java-jdtls-adapter";

export { buildJdtlsServiceProfile } from "./profile.js";
export {
  JsonRpcResponseError,
  JsonRpcStdioClient,
  encodeJsonRpcMessage
} from "./json-rpc-client.js";
export { createJdtlsSession } from "./jdtls-session.js";
export { startJdtlsProcessSession } from "./process-session.js";
export { createLspDiagnosticRegistry } from "./diagnostic-registry.js";
export { createJdtlsManager } from "./jdtls-manager.js";
export { createJavaFileVersionTracker } from "./file-version-tracker.js";
export { createJdtlsRestartPolicy } from "./restart-policy.js";
export { createResilientJdtlsManager } from "./resilient-jdtls-manager.js";
export type {
  BuildJdtlsServiceProfileOptions,
  ExecutableResolver,
  JavaWorkspaceSignals,
  JdtlsOperationContract,
  JdtlsOperationName,
  JdtlsServiceProfile,
  JdtlsServiceStatus
} from "./types.js";
export type {
  JsonRpcErrorResponseMessage,
  JsonRpcId,
  JsonRpcIncomingMessage,
  JsonRpcNotificationHandler,
  JsonRpcNotificationMessage,
  JsonRpcRequestMessage,
  JsonRpcStdioClientOptions,
  JsonRpcSuccessResponseMessage
} from "./json-rpc-client.js";
export type {
  JdtlsSession,
  JdtlsSessionOptions,
  DidChangeTextDocumentInput,
  DidCloseTextDocumentInput,
  DidOpenTextDocumentInput,
  DidSaveTextDocumentInput,
  ReferenceInput,
  TextDocumentPositionInput
} from "./jdtls-session.js";
export type {
  JdtlsJavaFileAutoSyncInput,
  JdtlsJavaFileSyncInput,
  JdtlsManager,
  JdtlsManagerOptions
} from "./jdtls-manager.js";
export type { JavaFileVersionTracker } from "./file-version-tracker.js";
export type {
  JdtlsRestartPlan,
  JdtlsRestartPolicy,
  JdtlsRestartPolicyOptions
} from "./restart-policy.js";
export type {
  JdtlsProcessSessionStarter,
  JdtlsRestartSleep,
  ResilientJdtlsManager,
  ResilientJdtlsManagerOptions,
  ResilientJdtlsStateSnapshot,
  ResilientJdtlsStatus
} from "./resilient-jdtls-manager.js";
export type {
  LspDiagnosticRegistry,
  LspDiagnosticRegistryOptions
} from "./diagnostic-registry.js";
export type {
  JdtlsChildProcess,
  JdtlsProcessSession,
  JdtlsProcessSpawner,
  StartJdtlsProcessSessionOptions
} from "./process-session.js";
export type {
  JdtlsInitializeResult,
  LspDiagnostic,
  LspPublishDiagnosticsParams,
  LspPosition,
  LspReferenceParams,
  LspTextDocumentIdentifier,
  LspTextDocumentPositionParams
} from "./lsp-types.js";
