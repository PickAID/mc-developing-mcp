# JDTLS Restart And Version Tracker Verification

Date: 2026-04-27

Scope:

- `packages/java-jdtls-adapter/src/file-version-tracker.ts`
- `packages/java-jdtls-adapter/src/restart-policy.ts`
- `packages/java-jdtls-adapter/src/resilient-jdtls-manager.ts`
- `packages/java-jdtls-adapter/src/jdtls-manager.ts`
- `packages/java-jdtls-adapter/src/process-session.ts`

## Actual Method Results

### Java File Version Tracker

Test file: `packages/java-jdtls-adapter/src/file-version-tracker.test.ts`

Input file:

```text
/workspace/src/main/java/demo/Example.java
```

Observed results:

```ts
tracker.open(filePath) === 1
tracker.current(filePath) === 1
tracker.change(filePath) === 2
tracker.change(filePath) === 3
tracker.close(filePath) === undefined
tracker.current(filePath) === undefined
tracker.open(filePath) === 1
tracker.change("/workspace/src/main/java/demo/LateOpen.java") === 1
```

Meaning:

- The manager can stop requiring upper layers to manually maintain LSP document versions forever.
- `didClose` clears version state, so reopening starts cleanly at version `1`.
- The standalone tracker can start a missing file at version `1`, but the manager blocks auto `didChange` before `didOpen` to keep LSP ordering valid.

### JDTLS Manager Auto Version Sync

Test file: `packages/java-jdtls-adapter/src/jdtls-manager.test.ts`

Observed session calls:

```ts
[
  {
    method: "didOpen",
    input: { filePath, languageId: "java", version: 1 }
  },
  {
    method: "didChange",
    input: { filePath, version: 2 }
  },
  {
    method: "didClose",
    input: { filePath }
  },
  {
    method: "didOpen",
    input: { filePath, languageId: "java", version: 1 }
  }
]
```

Manual version APIs still exist:

```ts
manager.didOpenJavaFile({ filePath, text, version })
manager.didChangeJavaFile({ filePath, text, version })
```

New auto version APIs:

```ts
manager.didOpenJavaFileAutoVersion({ filePath, text })
manager.didChangeJavaFileAutoVersion({ filePath, text })
```

Auto `didChange` before auto `didOpen`:

```ts
manager.didChangeJavaFileAutoVersion({ filePath, text })
// throws:
"Cannot send auto-versioned didChange before didOpen for Java file."
```

### Restart Policy

Test file: `packages/java-jdtls-adapter/src/restart-policy.test.ts`

Policy input:

```ts
{
  maxRestarts: 3,
  initialDelayMs: 100,
  maxDelayMs: 250,
  multiplier: 2
}
```

Observed return values:

```ts
policy.plan(1) === { allowed: true, attempt: 1, delayMs: 100 }
policy.plan(2) === { allowed: true, attempt: 2, delayMs: 200 }
policy.plan(3) === { allowed: true, attempt: 3, delayMs: 250 }
policy.plan(4) === { allowed: false, attempt: 4, delayMs: 0 }
```

Meaning:

- Restart cost is bounded.
- Delay grows exponentially but is capped.
- The restart budget is explicit and testable.

### Resilient JDTLS Manager

Test file: `packages/java-jdtls-adapter/src/resilient-jdtls-manager.test.ts`

Start plus manual restart:

```ts
records.length === 2
records[0] includes { initializeCalls: 1, stopCalls: 1 }
records[1] includes { initializeCalls: 1 }
sleepDelays === [25]
manager.state() includes {
  status: "running",
  restartAttempts: 1,
  lastRestartReason: "manual-check"
}
```

Restart budget exhausted:

```ts
await manager.restart("second")
// rejects with:
"JDTLS restart budget exhausted after 2 attempts."

manager.state() includes {
  status: "error",
  restartAttempts: 2,
  lastRestartReason: "second"
}
```

Unexpected process exit:

```ts
records.length === 2
records[0].stopCalls === 1
records[1].initializeCalls === 1
sleepDelays === [10]
manager.state() includes {
  status: "running",
  restartAttempts: 1,
  lastRestartReason: "process_exit"
}
```

Stale process exit after replacement:

```ts
records.length === 2
manager.state() includes {
  status: "running",
  restartAttempts: 1,
  lastRestartReason: "manual"
}
```

Concurrent restart calls:

```ts
const firstRestart = manager.restart("first")
const secondRestart = manager.restart("second")

records.length === 2
records[0].stopCalls === 1
manager.state() includes {
  status: "running",
  restartAttempts: 1,
  lastRestartReason: "first"
}
```

Meaning: concurrent restart requests share one in-flight restart instead of creating multiple untracked JDTLS processes.

Stop during restart backoff:

```ts
const restarting = manager.restart("process_exit")
await manager.stop()
await restarting
// rejects with:
"JDTLS restart cancelled."

records.length === 1
records[0].stopCalls === 1
manager.state() includes { status: "stopped" }
```

Meaning: an explicit stop cancels delayed restart work and does not resurrect JDTLS after shutdown.

Initialization failure cleanup:

```ts
await manager.start()
// rejects with:
"initialize failed"

records[0] includes { initializeCalls: 1, stopCalls: 1 }
manager.currentManager() === undefined
manager.state() includes { status: "error" }

// after failure flag is removed:
await manager.start()
records.length === 2
records[1] includes { initializeCalls: 1, stopCalls: 0 }
manager.state() includes { status: "running" }
```

Meaning: a failed JDTLS initialization does not leave a hidden process/session behind, and a later retry can start cleanly.

Synchronous process start failure:

```ts
await manager.start()
// rejects with:
"spawn failed"

manager.currentManager() === undefined
manager.state() includes {
  status: "error",
  lastError: "spawn failed"
}

// after the starter stops throwing:
await manager.start()
records.length === 1
records[0] includes { initializeCalls: 1, stopCalls: 0 }
manager.state() includes { status: "running" }
```

Meaning: a synchronous JDTLS spawn/start failure does not leave the lifecycle stuck in `starting`.

Meaning:

- A crashed active JDTLS process can be restarted without exposing extra public MCP tools.
- Old process `exit` events are ignored after the session has already been replaced.
- Restart calls are serialized through one in-flight restart promise.
- Stop and initialization failure paths clean up process sessions instead of leaving stale `active` state.
- Tests use injected starters and sleepers, so no real JDTLS process is spawned during unit tests.

## Review-Driven Fixes

Subagent review found these risks after the first implementation:

- Concurrent `restart()` calls could create multiple JDTLS processes and only track the last one.
- `stop()` during delayed restart could allow a pending restart to start JDTLS again.
- Restart budget exhaustion left `active` intact.
- Initialization failure left the failed session active.
- Auto-versioned `didChange` could be sent before `didOpen`.
- Synchronous `startProcessSession` failure could leave the manager stuck in `starting`.

All six now have regression tests in:

- `packages/java-jdtls-adapter/src/resilient-jdtls-manager.test.ts`
- `packages/java-jdtls-adapter/src/jdtls-manager.test.ts`

## Command Results

### Java JDTLS Adapter Package Test

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/java-jdtls-adapter test
```

Observed output:

```text
Test Files  9 passed (9)
Tests  26 passed (26)
```

### Full Test Suite

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
```

Observed output:

```text
Test Files  48 passed (48)
Tests  149 passed (149)
```

### Typecheck

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
```

Observed output:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

Exit code: `0`

### Go Residue Check

Command:

```sh
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Observed output:

```text

```

Meaning: no Go source/module files were found outside `node_modules`.

### 500 Line Limit Check

Command:

```sh
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/tests -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed output:

```text

```

Meaning: no TypeScript source/test file exceeded 500 lines.

Largest touched JDTLS adapter files:

```text
346 packages/java-jdtls-adapter/src/resilient-jdtls-manager.test.ts
288 packages/java-jdtls-adapter/src/resilient-jdtls-manager.ts
261 packages/java-jdtls-adapter/src/jdtls-manager.test.ts
97  packages/java-jdtls-adapter/src/jdtls-manager.ts
47  packages/java-jdtls-adapter/src/restart-policy.ts
36  packages/java-jdtls-adapter/src/file-version-tracker.ts
```

## Current Limitation

This stage verifies the process lifecycle logic with fake process sessions. A real local JDTLS smoke test against a Java or Gradle workspace is still the next required layer before calling the LSP integration production-ready.
