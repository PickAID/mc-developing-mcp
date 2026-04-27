import {
  createJdtlsManager,
  type JdtlsManager
} from "./jdtls-manager.js";
import type { LspDiagnosticRegistry } from "./diagnostic-registry.js";
import type { JdtlsInitializeResult } from "./lsp-types.js";
import {
  type JdtlsProcessSession,
  type StartJdtlsProcessSessionOptions,
  startJdtlsProcessSession
} from "./process-session.js";
import {
  createJdtlsRestartPolicy,
  type JdtlsRestartPolicy,
  type JdtlsRestartPolicyOptions
} from "./restart-policy.js";
import type { JdtlsServiceProfile } from "./types.js";

export type ResilientJdtlsStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export interface ResilientJdtlsStateSnapshot {
  status: ResilientJdtlsStatus;
  restartAttempts: number;
  lastRestartReason?: string;
  lastError?: string;
}

export type JdtlsProcessSessionStarter = (
  options: StartJdtlsProcessSessionOptions
) => JdtlsProcessSession;

export type JdtlsRestartSleep = (delayMs: number) => Promise<void>;

export interface ResilientJdtlsManagerOptions {
  profile: JdtlsServiceProfile;
  diagnostics: LspDiagnosticRegistry;
  restartPolicy?: JdtlsRestartPolicyOptions | JdtlsRestartPolicy;
  processOptions?: Omit<StartJdtlsProcessSessionOptions, "profile">;
  startProcessSession?: JdtlsProcessSessionStarter;
  sleep?: JdtlsRestartSleep;
  onStateChange?: (state: ResilientJdtlsStateSnapshot) => void;
}

export interface ResilientJdtlsManager {
  start(): Promise<JdtlsInitializeResult>;
  ready(): Promise<JdtlsInitializeResult>;
  restart(reason?: string): Promise<JdtlsInitializeResult>;
  stop(): Promise<void>;
  state(): ResilientJdtlsStateSnapshot;
  currentManager(): JdtlsManager | undefined;
}

interface ActiveJdtlsSession {
  processSession: JdtlsProcessSession;
  manager: JdtlsManager;
}

export function createResilientJdtlsManager(
  options: ResilientJdtlsManagerOptions
): ResilientJdtlsManager {
  const policy = normalizeRestartPolicy(options.restartPolicy);
  const sleep = options.sleep ?? defaultSleep;
  const startProcess = options.startProcessSession ?? startJdtlsProcessSession;
  let active: ActiveJdtlsSession | undefined;
  let status: ResilientJdtlsStatus = "stopped";
  let readyPromise: Promise<JdtlsInitializeResult> | undefined;
  let restartInFlight: Promise<JdtlsInitializeResult> | undefined;
  let restartAttempts = 0;
  let lifecycleToken = 0;
  let lastRestartReason: string | undefined;
  let lastError: string | undefined;

  const state = (): ResilientJdtlsStateSnapshot => ({
    status,
    restartAttempts,
    lastRestartReason,
    lastError
  });

  const setStatus = (nextStatus: ResilientJdtlsStatus, error?: unknown): void => {
    status = nextStatus;
    lastError = error ? errorMessage(error) : undefined;
    options.onStateChange?.(state());
  };

  const startFresh = (token: number): Promise<JdtlsInitializeResult> => {
    setStatus("starting");
    let processSession: JdtlsProcessSession;

    try {
      processSession = startProcess({
        ...options.processOptions,
        profile: options.profile
      });
    } catch (error) {
      active = undefined;
      readyPromise = undefined;
      setStatus("error", error);
      throw error;
    }

    const manager = createJdtlsManager({
      session: processSession.session,
      diagnostics: options.diagnostics
    });
    active = { processSession, manager };
    attachUnexpectedExitHandler(processSession);
    readyPromise = manager.start().then(
      async (result) => {
        if (token !== lifecycleToken || status === "stopping") {
          await stopActive(false);
          throw new Error("JDTLS start cancelled.");
        }
        setStatus("running");
        return result;
      },
      async (error) => {
        if (active?.processSession === processSession) {
          await stopActive(false);
        }
        if (token === lifecycleToken) {
          setStatus("error", error);
        }
        throw error;
      }
    );

    return readyPromise;
  };

  const stopActive = async (graceful: boolean): Promise<void> => {
    const current = active;
    active = undefined;
    readyPromise = undefined;

    if (!current) {
      return;
    }

    if (graceful) {
      await current.manager.stop().catch(() => undefined);
    }
    current.processSession.stop();
  };

  const restartInternal = async (
    reason: string,
    token: number
  ): Promise<JdtlsInitializeResult> => {
    const attempt = restartAttempts + 1;
    const plan = policy.plan(attempt);
    restartAttempts = attempt;
    lastRestartReason = reason;
    setStatus("starting");

    if (!plan.allowed) {
      const error = new Error(
        `JDTLS restart budget exhausted after ${attempt} attempts.`
      );
      await stopActive(false);
      setStatus("error", error);
      throw error;
    }

    await stopActive(false);
    if (plan.delayMs > 0) {
      await sleep(plan.delayMs);
    }

    if (token !== lifecycleToken || status === "stopped") {
      throw new Error("JDTLS restart cancelled.");
    }

    return startFresh(token);
  };

  const restart = (
    reason = "manual"
  ): Promise<JdtlsInitializeResult> => {
    if (restartInFlight) {
      return restartInFlight;
    }

    const token = lifecycleToken + 1;
    lifecycleToken = token;
    const pendingRestart = restartInternal(reason, token).finally(() => {
      if (restartInFlight === pendingRestart) {
        restartInFlight = undefined;
      }
    });
    restartInFlight = pendingRestart;

    return pendingRestart;
  };

  const attachUnexpectedExitHandler = (
    processSession: JdtlsProcessSession
  ): void => {
    processSession.process.on?.("exit", () => {
      if (active?.processSession !== processSession) {
        return;
      }
      if (status === "stopping" || status === "stopped") {
        return;
      }
      void restart("process_exit").catch(() => undefined);
    });
    processSession.process.on?.("error", (error) => {
      if (active?.processSession !== processSession) {
        return;
      }
      if (status === "stopping" || status === "stopped") {
        return;
      }
      lastError = error.message;
      void restart("process_error").catch(() => undefined);
    });
  };

  return {
    async start() {
      if (readyPromise && (status === "starting" || status === "running")) {
        return readyPromise;
      }

      if (restartInFlight) {
        return restartInFlight;
      }

      lifecycleToken += 1;
      restartAttempts = 0;
      if (active) {
        await stopActive(false);
      }

      return startFresh(lifecycleToken);
    },

    ready() {
      if (!readyPromise) {
        throw new Error("Resilient JDTLS manager has not been started.");
      }

      return readyPromise;
    },

    restart,

    async stop() {
      lifecycleToken += 1;
      restartInFlight = undefined;
      setStatus("stopping");
      await stopActive(true);
      restartAttempts = 0;
      lastRestartReason = undefined;
      setStatus("stopped");
    },

    state,

    currentManager() {
      return active?.manager;
    }
  };
}

function normalizeRestartPolicy(
  input: JdtlsRestartPolicyOptions | JdtlsRestartPolicy | undefined
): JdtlsRestartPolicy {
  if (input && "plan" in input) {
    return input;
  }

  return createJdtlsRestartPolicy(input);
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
