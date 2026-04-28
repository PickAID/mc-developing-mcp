# MCP Structured Content Budget Verification
Date: 2026-04-28
Author: m1hono
Scope: `apps/mcp-server` `mc_develop` structured output budgeting

## Change
`mc_develop` now builds structured MCP output through a dedicated `mcp-structured-content` module instead of keeping that logic inside `mcp-tools.ts`.

The public MCP surface is unchanged:

- One exposed tool: `mc_develop`
- Internal route and executor chain unchanged
- `requestPlan` and `evidencePlan` still stay out of returned `structuredContent`

The new layer applies a bounded payload policy:

- arrays are capped by `maxArrayItems`
- long strings are capped by `maxStringLength`
- deeply nested payloads are capped by `maxDepth`
- truncated executions get `payloadBudget`
- top-level `budget.truncatedExecutionIds` records which executions were compacted

This keeps the MCP useful for follow-up reasoning without letting large logs, ProbeJS snippets, datapack/assets matches, or JAR search payloads consume unbounded context.

## RED Tests
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/mcp-structured-content.test.ts
```

Observed failure before implementation:

```text
Error: Cannot find module './mcp-structured-content.js'
```

Command:

```bash
pnpm exec vitest run apps/mcp-server/src/package-metadata.test.ts
```

Observed failure before wiring the new regression into the package test script:

```text
expected 'tsc -b ../../packages/shared-types ..…' to contain 'mcp-structured-content.test.ts'
```

## Budgeted Return Shape
Synthetic unit test input uses a large `actionableClassReferences` array, a large `snippets` array, and a long ProbeJS documentation string.

Observed compacted result excerpt:

```json
{
  "budget": {
    "payloadPolicy": "bounded",
    "maxArrayItems": 2,
    "maxStringLength": 24,
    "maxDepth": 6,
    "truncatedExecutionIds": [
      "candidate-1-log_files",
      "candidate-2-probejs_types"
    ]
  },
  "executions": [
    {
      "candidateId": "candidate-1-log_files",
      "payload": {
        "signals": {
          "actionableClassReferences": [
            "com.example.First",
            "com.example.Second"
          ]
        }
      },
      "payloadBudget": {
        "truncated": true,
        "omittedArrayItems": 2,
        "truncatedStrings": 0
      }
    }
  ],
  "selectedEvidence": {
    "candidateId": "candidate-2-probejs_types",
    "payload": {
      "snippets": [
        { "label": "server.recipes" },
        { "label": "event.shaped" }
      ],
      "documentation": "This ProbeJS documentati...<truncated 55 chars>"
    },
    "payloadBudget": {
      "truncated": true,
      "omittedArrayItems": 1,
      "truncatedStrings": 1
    }
  }
}
```

## Real Stdio Return Value
Command:

```bash
pnpm --filter @mcpskill/mcp-server build
pnpm exec tsx tmp/stdio-subprocess-real-output.ts
```

Observed subprocess result excerpt:

```json
{
  "tools": [
    {
      "name": "mc_develop",
      "title": "Minecraft Development Assistant",
      "requiredInput": ["requestText"]
    }
  ],
  "callResult": {
    "text": {
      "type": "text",
      "text": "Selected: candidate-2-mod_archive_content (mod_archive_content, context.query)\nRoute: log_files -> mod_archive_content -> workspace_source -> docs_lookup\nExecuted: candidate-1-log_files, candidate-2-mod_archive_content\nContext: candidate-1-log_files\nSummary: Located 1 class owner match(es) in mod archives."
    },
    "structuredContent": {
      "budget": {
        "payloadPolicy": "bounded",
        "maxArrayItems": 20,
        "maxStringLength": 4000,
        "maxDepth": 8,
        "truncatedExecutionIds": []
      },
      "trace": {
        "contextCandidateIds": ["candidate-1-log_files"],
        "selectedCandidateId": "candidate-2-mod_archive_content",
        "fallbackUsed": false
      },
      "selectedEvidence": {
        "candidateId": "candidate-2-mod_archive_content",
        "payload": {
          "source": "mod_archive_content",
          "mode": "class_owner",
          "requestedClasses": ["com.example.problem.CrashHandler"],
          "searchedArchives": 1,
          "truncated": false
        }
      }
    }
  }
}
```

The real crash-modpack fixture is small, so no execution was truncated. The returned `budget` field proves the bounded policy is active for the same stdio path used by local MCP clients.

## Verification Commands
```bash
pnpm exec vitest run apps/mcp-server/src/mcp-structured-content.test.ts apps/mcp-server/src/package-metadata.test.ts apps/mcp-server/src/mcp-tools.test.ts
pnpm exec tsc -b apps/mcp-server --pretty false
pnpm --filter @mcpskill/mcp-server build
pnpm exec tsx tmp/stdio-subprocess-real-output.ts
pnpm typecheck
pnpm --filter @mcpskill/mcp-server test
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

## Current Results
- `pnpm exec vitest run apps/mcp-server/src/mcp-structured-content.test.ts apps/mcp-server/src/package-metadata.test.ts apps/mcp-server/src/mcp-tools.test.ts`: 3 test files passed, 3 tests passed.
- `pnpm exec tsc -b apps/mcp-server --pretty false`: passed.
- `pnpm --filter @mcpskill/mcp-server build`: passed.
- `pnpm exec tsx tmp/stdio-subprocess-real-output.ts`: listed `mc_develop` and returned bounded `structuredContent.budget`.
- `pnpm typecheck`: `tsc -b --pretty false` passed.
- `pnpm --filter @mcpskill/mcp-server test`: 25 test files passed, 57 tests passed.
- `pnpm test`: 73 test files passed, 218 tests passed.
- 500-line source/test check: no files reported.
- Go residual check: no files reported.
