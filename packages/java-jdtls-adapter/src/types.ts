export type JdtlsServiceStatus =
  | "ready"
  | "missing_jdtls"
  | "missing_java"
  | "not_java_workspace";

export type JdtlsOperationName =
  | "definition"
  | "references"
  | "hover"
  | "workspaceSymbol"
  | "diagnostics";

export type ExecutableResolver = (
  executableName: string,
  env: NodeJS.ProcessEnv
) => Promise<string | undefined> | string | undefined;

export interface JavaWorkspaceSignals {
  readonly hasGradleBuild: boolean;
  readonly hasGradleSettings: boolean;
  readonly hasMavenPom: boolean;
  readonly hasJavaSourceRoot: boolean;
  readonly buildFiles: readonly string[];
  readonly sourceRoots: readonly string[];
}

export interface JdtlsOperationContract {
  readonly operation: JdtlsOperationName;
  readonly lspMethod: string;
  readonly implemented: boolean;
}

export interface JdtlsServiceProfile {
  readonly status: JdtlsServiceStatus;
  readonly workspaceRoot: string;
  readonly workspaceDataDir: string;
  readonly workspaceSignals: JavaWorkspaceSignals;
  readonly javaHome?: string;
  readonly javaExecutable?: string;
  readonly jdtlsExecutable?: string;
  readonly supportedOperations: readonly JdtlsOperationName[];
  readonly operationContracts: readonly JdtlsOperationContract[];
}

export interface BuildJdtlsServiceProfileOptions {
  readonly workspaceRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly executableResolver?: ExecutableResolver;
}
