# Stdio MCP Tool Verification
Date: 2026-04-28
Author: m1hono
Scope: `apps/mcp-server` stdio MCP shell and progressive high-level tool

## Change
`@mcpskill/mcp-server` now has a real TypeScript MCP SDK shell.

The public MCP tool surface is intentionally small:

- One exposed MCP tool: `mc_develop`
- Internal routing still uses the existing pipeline: `workspace.analyze`, `source.bundle`, `context.query`
- The stdio binary is `mc-developing-mcp`

This keeps the MCP usable without exposing many low-level methods to the client. The tool description carries the core harness guidance: use local Minecraft evidence before guessing, treat KubeJS as Minecraft scripting rather than generic JavaScript, and inspect Gradle, ProbeJS/d.ts, datapack/assets, logs, and mod JARs through the internal pipeline.

## RED Tests
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mcp-tools.test.ts
```

Observed failure before implementation:

```text
Error: Cannot find module './mcp-tools.js'
```

Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mcp-server.test.ts
```

Observed failure before implementation:

```text
Error: Cannot find module './mcp-server.js'
```

Command:

```bash
pnpm exec vitest run apps/mcp-server/src/package-metadata.test.ts
```

Observed failure before adding `bin`:

```text
expected undefined to deeply equal { "mc-developing-mcp": "./dist/stdio.js" }
```

## Implemented Behavior
- Adds `@modelcontextprotocol/sdk` and `zod` as MCP server dependencies.
- Registers one high-level tool, `mc_develop`, using the SDK `registerTool` API.
- Adds SDK-backed `createMcpSkillServer()`.
- Adds `runMcpServerStdio()` and `mc-developing-mcp` bin metadata.
- Returns compact text plus compact structured content.
- Keeps `requestPlan` and `evidencePlan` out of `structuredContent` to avoid token waste.

## Real MCP SDK Return Value
Command:

```bash
pnpm exec tsx /tmp/mcpskill-mcp-stdio-real-output.ts
```

Observed result excerpt:

```json
{
  "tools": [
    {
      "name": "mc_develop",
      "title": "Minecraft Development Assistant",
      "annotations": {
        "readOnlyHint": true,
        "destructiveHint": false,
        "idempotentHint": true,
        "openWorldHint": false
      },
      "requiredInput": ["requestText"]
    }
  ],
  "callResult": {
    "text": {
      "type": "text",
      "text": "Selected: candidate-2-mod_archive_content (mod_archive_content, context.query)\nRoute: log_files -> mod_archive_content -> workspace_source -> docs_lookup\nExecuted: candidate-1-log_files, candidate-2-mod_archive_content\nContext: candidate-1-log_files\nSummary: Located 1 class owner match(es) in mod archives."
    },
    "structuredContent": {
      "appId": "mcp-server",
      "workspace": {
        "kind": "modpack",
        "facts": {
          "hasModArchives": true,
          "logPathCount": 1
        }
      },
      "trace": {
        "contextCandidateIds": ["candidate-1-log_files"],
        "selectedCandidateId": "candidate-2-mod_archive_content",
        "fallbackUsed": false
      },
      "selectedEvidence": {
        "candidateId": "candidate-2-mod_archive_content",
        "routeStep": "mod_archive_content",
        "preferredTool": "context.query",
        "status": "selected",
        "payload": {
          "source": "mod_archive_content",
          "mode": "class_owner",
          "requestedClasses": ["com.example.problem.CrashHandler"],
          "matches": [
            {
              "binaryName": "com.example.problem.CrashHandler",
              "relativePath": "com/example/problem/CrashHandler.class",
              "matchKind": "exact"
            }
          ]
        }
      }
    }
  }
}
```

## Verification Commands
```bash
pnpm exec vitest run apps/mcp-server/src/mcp-tools.test.ts apps/mcp-server/src/mcp-server.test.ts apps/mcp-server/src/package-metadata.test.ts
pnpm typecheck
pnpm --filter @mcpskill/mcp-server test
pnpm exec tsx /tmp/mcpskill-mcp-stdio-real-output.ts
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

## Current Results
- `pnpm exec vitest run apps/mcp-server/src/mcp-tools.test.ts apps/mcp-server/src/mcp-server.test.ts apps/mcp-server/src/package-metadata.test.ts`: 3 test files passed, 3 tests passed.
- `pnpm typecheck`: `tsc -b --pretty false` passed.
- `pnpm --filter @mcpskill/mcp-server test`: 23 test files passed, 55 tests passed.
- `pnpm exec tsx /tmp/mcpskill-mcp-stdio-real-output.ts`: listed `mc_develop` and returned selected mod archive class owner evidence.
- `pnpm test`: 71 test files passed, 216 tests passed.
- 500-line source/test check: no files reported.
- Go residual check: no files reported.
