# JDTLS JSON-RPC Session Verification
Date: 2026-04-27
Author: m1hono
Scope: `@mcpskill/java-jdtls-adapter` JDTLS session layer

## What Changed
This slice turns the previous JDTLS environment/profile layer into a real session-capable layer:

- Added a no-dependency JSON-RPC stdio client for LSP framing.
- Added request/response matching with timeout and error response handling.
- Added notification routing for passive diagnostics.
- Added JDTLS session methods for `initialize`, `shutdown`, `workspace/symbol`, `hover`, `definition`, and `references`.
- Added process session startup with injectable `spawnProcess`, default `jdtls -data <workspaceDataDir>` args, and explicit `stop()`.
- Changed JDTLS operation contracts to `implemented: true` for definition, references, hover, workspaceSymbol, and diagnostics.
- Restricted spawned JDTLS process environment to a small allowlist so secrets such as Maven passwords are not passed by default.

## Verification Commands
```bash
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/java-jdtls-adapter test
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/service-profile test
```

## Package-Level Results
- `@mcpskill/java-jdtls-adapter`: 4 test files passed, 10 tests passed.
- `@mcpskill/service-profile`: 1 test file passed, 1 test passed after prompt guidance was updated to list implemented LSP operations.

## Real Return Values
The sample uses mock stdio streams, but it exercises the real JSON-RPC client/session code. It does not require a local JDTLS binary.

### Passive Diagnostics
```json
{
  "uri": "file:///tmp/.../src/main/java/demo/Example.java",
  "diagnostics": [
    {
      "message": "broken",
      "severity": 1
    }
  ]
}
```

### Initialize Request
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "processId": 1234,
    "rootUri": "file:///tmp/mcpskill-jdtls-product",
    "capabilities": {}
  }
}
```

### Initialize Result
```json
{
  "capabilities": {
    "hoverProvider": true,
    "workspaceSymbolProvider": true
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

### Workspace Symbol Request And Result
```json
{
  "request": {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "workspace/symbol",
    "params": {
      "query": "ItemStack"
    }
  },
  "result": [
    {
      "name": "ItemStack",
      "kind": 5
    }
  ]
}
```

### Process Session Startup
```json
{
  "command": "/toolchain/bin/jdtls",
  "args": [
    "-data",
    "/tmp/mcpskill-jdtls-product/.mcpskill/jdtls"
  ],
  "cwd": "/tmp/mcpskill-jdtls-product",
  "env": {
    "HOME": "/Users/gedwen",
    "JAVA_HOME": "/jdk",
    "JDK_HOME": "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
    "LANG": "C.UTF-8",
    "LC_ALL": "C.UTF-8",
    "LC_CTYPE": "C.UTF-8",
    "PATH": "/toolchain/bin",
    "TMPDIR": "/tmp/"
  }
}
```

The sample intentionally passed `MAVEN_PASSWORD: "must-not-leak"` into startup options. The spawned environment did not include it.

## Remaining Gaps
- This still does not run a real local JDTLS binary in CI; it verifies the JSON-RPC/session layer with mock stdio.
- No restart/backoff manager yet.
- No diagnostic registry, dedupe, or prompt attachment queue yet.
- No file synchronization methods yet (`didOpen`, `didChange`, `didSave`, `didClose`).
