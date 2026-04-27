# JDTLS Manager, File Sync, And Diagnostics Verification
Date: 2026-04-27
Author: m1hono
Scope: `@mcpskill/java-jdtls-adapter` manager layer

## What Changed
This slice builds on the JSON-RPC JDTLS session layer and adds:

- `createLspDiagnosticRegistry(...)`
  - replaces diagnostics per URI
  - dedupes identical diagnostics
  - sorts by severity
  - enforces per-file and total diagnostic budgets
  - supports one-shot pending drain for prompt/attachment injection
- `JdtlsSession` file sync notifications:
  - `didOpen`
  - `didChange`
  - `didSave`
  - `didClose`
- `createJdtlsManager(...)`
  - owns session startup readiness promise
  - registers `textDocument/publishDiagnostics` into the registry
  - exposes Java-specific file sync helpers
  - shuts the session down through LSP `shutdown` + `exit`

## Verification Command
```bash
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/java-jdtls-adapter test
```

Result:
- 6 test files passed.
- 13 tests passed.

## Real Return Values
The sample uses mock stdio streams but runs the real JSON-RPC client, JDTLS session, manager, and diagnostic registry.

### Initialize
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "processId": null,
    "rootUri": "file:///tmp/mcpskill-jdtls-manager-product",
    "capabilities": {}
  }
}
```

### Initialized Notification
```json
{
  "jsonrpc": "2.0",
  "method": "initialized",
  "params": {}
}
```

### Pending Diagnostics
The input intentionally included duplicate diagnostics and more diagnostics than the per-file budget. The registry returned severity-ordered, deduped, budgeted output:

```json
[
  {
    "uri": "file:///tmp/mcpskill-jdtls-manager-product/src/main/java/demo/Example.java",
    "diagnostics": [
      {
        "message": "error",
        "severity": 1
      },
      {
        "message": "duplicate warning",
        "severity": 2
      }
    ]
  }
]
```

### didOpen
```json
{
  "jsonrpc": "2.0",
  "method": "textDocument/didOpen",
  "params": {
    "textDocument": {
      "uri": "file:///tmp/mcpskill-jdtls-manager-product/src/main/java/demo/Example.java",
      "languageId": "java",
      "version": 1,
      "text": "package demo;\\nclass Example {}\\n"
    }
  }
}
```

### didChange
```json
{
  "jsonrpc": "2.0",
  "method": "textDocument/didChange",
  "params": {
    "textDocument": {
      "uri": "file:///tmp/mcpskill-jdtls-manager-product/src/main/java/demo/Example.java",
      "version": 2
    },
    "contentChanges": [
      {
        "text": "package demo;\\nclass Example { int value; }\\n"
      }
    ]
  }
}
```

### Shutdown And Exit
```json
{
  "shutdownRequest": {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "shutdown",
    "params": null
  },
  "exit": {
    "jsonrpc": "2.0",
    "method": "exit"
  }
}
```

## Remaining Gaps
- No restart/backoff manager yet.
- No real local JDTLS binary smoke test yet.
- No file version tracker yet; callers must provide versions.
- No attachment bridge into MCP response payloads yet; registry currently exposes pending diagnostics for the next layer to consume.
