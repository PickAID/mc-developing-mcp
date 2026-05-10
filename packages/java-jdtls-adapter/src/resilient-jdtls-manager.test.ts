import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLspDiagnosticRegistry } from "./diagnostic-registry.js";
import { createResilientJdtlsManager } from "./resilient-jdtls-manager.js";
import type { JdtlsChildProcess, JdtlsProcessSession } from "./process-session.js";
import type { JdtlsSession } from "./jdtls-session.js";
import type { JdtlsServiceProfile } from "./types.js";

describe("createResilientJdtlsManager", () => {
  it("starts a process-backed manager and restarts it with backoff", async () => {
    const records: FakeProcessRecord[] = [];
    const sleepDelays: number[] = [];
    const manager = createResilientJdtlsManager({
      profile: readyProfile(),
      diagnostics: createLspDiagnosticRegistry(),
      restartPolicy: { maxRestarts: 2, initialDelayMs: 25 },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
      startProcessSession: () => createFakeProcessSession(records)
    });

    await manager.start();
    await manager.restart("manual-check");

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ initializeCalls: 1, stopCalls: 1 });
    expect(records[1]).toMatchObject({ initializeCalls: 1 });
    expect(sleepDelays).toEqual([25]);
    expect(manager.state()).toMatchObject({
      status: "running",
      restartAttempts: 1,
      lastRestartReason: "manual-check"
    });
  });

  it("moves to error when the restart budget is exhausted", async () => {
    const records: FakeProcessRecord[] = [];
    const manager = createResilientJdtlsManager({
      profile: readyProfile(),
      diagnostics: createLspDiagnosticRegistry(),
      restartPolicy: { maxRestarts: 1, initialDelayMs: 0 },
      sleep: async () => {},
      startProcessSession: () => createFakeProcessSession(records)
    });

    await manager.start();
    await manager.restart("first");

    await expect(manager.restart("second")).rejects.toThrow(
      "JDTLS restart budget exhausted after 2 attempts."
    );
    expect(manager.state()).toMatchObject({
      status: "error",
      restartAttempts: 2,
      lastRestartReason: "second"
    });
    expect(records[1]?.stopCalls).toBe(1);
    expect(manager.currentManager()).toBeUndefined();
  });

  it("restarts automatically when the active process exits unexpectedly", async () => {
    const records: FakeProcessRecord[] = [];
    const exitListeners: Array<() => void> = [];
    const sleepDelays: number[] = [];
    const manager = createResilientJdtlsManager({
      profile: readyProfile(),
      diagnostics: createLspDiagnosticRegistry(),
      restartPolicy: { maxRestarts: 2, initialDelayMs: 10 },
      sleep: async (delayMs) => {
        sleepDelays.push(delayMs);
      },
      startProcessSession: () =>
        createFakeProcessSession(records, (listener) => exitListeners.push(listener))
    });

    await manager.start();
    exitListeners[0]();
    await new Promise((resolve) => setImmediate(resolve));

    expect(records).toHaveLength(2);
    expect(records[0]?.stopCalls).toBe(1);
    expect(records[1]?.initializeCalls).toBe(1);
    expect(sleepDelays).toEqual([10]);
    expect(manager.state()).toMatchObject({
      status: "running",
      restartAttempts: 1,
      lastRestartReason: "process_exit"
    });
  });

  it("ignores stale exit events from a session that was already replaced", async () => {
    const records: FakeProcessRecord[] = [];
    const exitListeners: Array<() => void> = [];
    const manager = createResilientJdtlsManager({
      profile: readyProfile(),
      diagnostics: createLspDiagnosticRegistry(),
      restartPolicy: { maxRestarts: 3, initialDelayMs: 0 },
      sleep: async () => {},
      startProcessSession: () =>
        createFakeProcessSession(records, (listener) => exitListeners.push(listener))
    });

    await manager.start();
    await manager.restart("manual");
    exitListeners[0]();
    await new Promise((resolve) => setImmediate(resolve));

    expect(records).toHaveLength(2);
    expect(manager.state()).toMatchObject({
      status: "running",
      restartAttempts: 1,
      lastRestartReason: "manual"
    });
  });

  it("serializes concurrent restart requests into one process replacement", async () => {
    const records: FakeProcessRecord[] = [];
    const sleep = createDeferredSleep();
    const manager = createResilientJdtlsManager({
      profile: readyProfile(),
      diagnostics: createLspDiagnosticRegistry(),
      restartPolicy: { maxRestarts: 3, initialDelayMs: 5 },
      sleep: sleep.wait,
      startProcessSession: () => createFakeProcessSession(records)
    });

    await manager.start();
    const firstRestart = manager.restart("first");
    const secondRestart = manager.restart("second");
    await sleep.started;

    expect(records).toHaveLength(1);

    sleep.resolve();
    await Promise.all([firstRestart, secondRestart]);

    expect(records).toHaveLength(2);
    expect(records[0]?.stopCalls).toBe(1);
    expect(manager.state()).toMatchObject({
      status: "running",
      restartAttempts: 1,
      lastRestartReason: "first"
    });
  });

  it("does not resurrect JDTLS when stop happens during restart backoff", async () => {
    const records: FakeProcessRecord[] = [];
    const sleep = createDeferredSleep();
    const manager = createResilientJdtlsManager({
      profile: readyProfile(),
      diagnostics: createLspDiagnosticRegistry(),
      restartPolicy: { maxRestarts: 3, initialDelayMs: 5 },
      sleep: sleep.wait,
      startProcessSession: () => createFakeProcessSession(records)
    });

    await manager.start();
    const restarting = manager.restart("process_exit");
    await sleep.started;
    await manager.stop();

    sleep.resolve();

    await expect(restarting).rejects.toThrow("JDTLS restart cancelled.");
    expect(records).toHaveLength(1);
    expect(records[0]?.stopCalls).toBe(1);
    expect(manager.state()).toMatchObject({ status: "stopped" });
  });

  it("cleans up failed initialization before a later start retry", async () => {
    const records: FakeProcessRecord[] = [];
    let failInitialize = true;
    const manager = createResilientJdtlsManager({
      profile: readyProfile(),
      diagnostics: createLspDiagnosticRegistry(),
      startProcessSession: () =>
        createFakeProcessSession(records, undefined, () => failInitialize)
    });

    await expect(manager.start()).rejects.toThrow("initialize failed");
    expect(records[0]).toMatchObject({ initializeCalls: 1, stopCalls: 1 });
    expect(manager.currentManager()).toBeUndefined();
    expect(manager.state()).toMatchObject({ status: "error" });

    failInitialize = false;
    await manager.start();

    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ initializeCalls: 1, stopCalls: 0 });
    expect(manager.state()).toMatchObject({ status: "running" });
  });

  it("records synchronous process start failures and allows a retry", async () => {
    const records: FakeProcessRecord[] = [];
    let failStart = true;
    const manager = createResilientJdtlsManager({
      profile: readyProfile(),
      diagnostics: createLspDiagnosticRegistry(),
      startProcessSession: () => {
        if (failStart) {
          throw new Error("spawn failed");
        }
        return createFakeProcessSession(records);
      }
    });

    await expect(manager.start()).rejects.toThrow("spawn failed");
    expect(manager.currentManager()).toBeUndefined();
    expect(manager.state()).toMatchObject({
      status: "error",
      lastError: "spawn failed"
    });

    failStart = false;
    await manager.start();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ initializeCalls: 1, stopCalls: 0 });
    expect(manager.state()).toMatchObject({ status: "running" });
  });
});

interface FakeProcessRecord {
  initializeCalls: number;
  shutdownCalls: number;
  stopCalls: number;
}

function createFakeProcessSession(
  records: FakeProcessRecord[],
  onExitListener?: (listener: () => void) => void,
  shouldFailInitialize?: () => boolean
): JdtlsProcessSession {
  const record: FakeProcessRecord = {
    initializeCalls: 0,
    shutdownCalls: 0,
    stopCalls: 0
  };
  records.push(record);

  const process: JdtlsChildProcess = {
    stdin: processWritable(),
    stdout: processReadable(),
    kill: () => {
      record.stopCalls += 1;
      return true;
    },
    on: (event, listener) => {
      if (event === "exit") {
        onExitListener?.(listener);
      }
      return process;
    }
  };

  return {
    session: fakeSession(record, shouldFailInitialize),
    client: undefined as never,
    process,
    command: "jdtls",
    args: [],
    stop: () => process.kill()
  };
}

function fakeSession(
  record: FakeProcessRecord,
  shouldFailInitialize?: () => boolean
): JdtlsSession {
  return {
    initialize: async () => {
      record.initializeCalls += 1;
      if (shouldFailInitialize?.()) {
        throw new Error("initialize failed");
      }
      return { capabilities: {} };
    },
    shutdown: async () => {
      record.shutdownCalls += 1;
    },
    workspaceSymbol: async () => [],
    hover: async () => undefined,
    definition: async () => undefined,
    references: async () => [],
    onDiagnostics: () => {},
    didOpen: () => {},
    didChange: () => {},
    didSave: () => {},
    didClose: () => {}
  };
}

function readyProfile(): JdtlsServiceProfile {
  const workspaceRoot = "/workspace";

  return {
    status: "ready",
    workspaceRoot,
    workspaceDataDir: join(workspaceRoot, ".mc-developing-mcp", "jdtls"),
    workspaceSignals: {
      hasGradleBuild: true,
      hasGradleSettings: false,
      hasMavenPom: false,
      hasJavaSourceRoot: true,
      buildFiles: [join(workspaceRoot, "build.gradle")],
      sourceRoots: [join(workspaceRoot, "src", "main", "java")]
    },
    javaExecutable: "/jdk/bin/java",
    jdtlsExecutable: "/toolchain/bin/jdtls",
    supportedOperations: ["definition"],
    operationContracts: []
  };
}

function processWritable(): NodeJS.WritableStream {
  return { write: () => true } as NodeJS.WritableStream;
}

function processReadable(): NodeJS.ReadableStream {
  return { on: () => undefined } as NodeJS.ReadableStream;
}

function createDeferredSleep(): {
  started: Promise<void>;
  wait: () => Promise<void>;
  resolve: () => void;
} {
  let resolveStarted: () => void = () => {};
  let resolveSleep: () => void = () => {};

  return {
    started: new Promise((resolve) => {
      resolveStarted = resolve;
    }),
    wait: () => {
      resolveStarted();
      return new Promise((resolve) => {
        resolveSleep = resolve;
      });
    },
    resolve: () => resolveSleep()
  };
}
