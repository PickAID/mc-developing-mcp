import type { JdtlsSession } from "./jdtls-session.js";
import type { LspDiagnosticRegistry } from "./diagnostic-registry.js";
import type { JdtlsInitializeResult } from "./lsp-types.js";
import {
  createJavaFileVersionTracker,
  type JavaFileVersionTracker
} from "./file-version-tracker.js";

export interface JdtlsJavaFileSyncInput {
  filePath: string;
  text: string;
  version: number;
}

export interface JdtlsJavaFileAutoSyncInput {
  filePath: string;
  text: string;
}

export interface JdtlsManagerOptions {
  session: JdtlsSession;
  diagnostics: LspDiagnosticRegistry;
  fileVersions?: JavaFileVersionTracker;
}

export interface JdtlsManager {
  start(): Promise<JdtlsInitializeResult>;
  ready(): Promise<JdtlsInitializeResult>;
  stop(): Promise<void>;
  didOpenJavaFile(input: JdtlsJavaFileSyncInput): void;
  didChangeJavaFile(input: JdtlsJavaFileSyncInput): void;
  didOpenJavaFileAutoVersion(input: JdtlsJavaFileAutoSyncInput): void;
  didChangeJavaFileAutoVersion(input: JdtlsJavaFileAutoSyncInput): void;
  didSaveJavaFile(filePath: string): void;
  didCloseJavaFile(filePath: string): void;
}

export function createJdtlsManager(options: JdtlsManagerOptions): JdtlsManager {
  let readyPromise: Promise<JdtlsInitializeResult> | undefined;
  const fileVersions = options.fileVersions ?? createJavaFileVersionTracker();

  options.session.onDiagnostics((params) => options.diagnostics.publish(params));

  return {
    start() {
      readyPromise ??= options.session.initialize();
      return readyPromise;
    },

    ready() {
      if (!readyPromise) {
        throw new Error("JDTLS manager has not been started.");
      }
      return readyPromise;
    },

    stop() {
      fileVersions.clear();
      return options.session.shutdown();
    },

    didOpenJavaFile(input) {
      options.session.didOpen({
        ...input,
        languageId: "java"
      });
    },

    didChangeJavaFile(input) {
      options.session.didChange(input);
    },

    didOpenJavaFileAutoVersion(input) {
      options.session.didOpen({
        ...input,
        languageId: "java",
        version: fileVersions.open(input.filePath)
      });
    },

    didChangeJavaFileAutoVersion(input) {
      if (fileVersions.current(input.filePath) === undefined) {
        throw new Error(
          "Cannot send auto-versioned didChange before didOpen for Java file."
        );
      }

      options.session.didChange({
        ...input,
        version: fileVersions.change(input.filePath)
      });
    },

    didSaveJavaFile(filePath) {
      options.session.didSave({ filePath });
    },

    didCloseJavaFile(filePath) {
      fileVersions.close(filePath);
      options.session.didClose({ filePath });
    }
  };
}
