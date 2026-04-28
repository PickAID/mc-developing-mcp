# Java Diagnostics Workspace Source Bridge Verification
Date: 2026-04-29
Author: m1hono
Scope: `java_diagnostics` context to `workspace_source`

## Change
Java diagnostic evidence now carries a workspace-relative source path for each diagnostic file.

The request context layer uses that `relativePath` before falling back to URI parsing. This keeps multi-module paths intact, so a diagnostic from `module-a/src/main/java/...` does not collapse into the wrong root-level `src/main/java/...` path.

The public MCP surface remains unchanged:

- still one public tool: `mc_develop`
- no new tool input fields
- no new public package exports

## RED Test
Command before implementation:

```bash
pnpm exec vitest run apps/mcp-server/src/request-executor.test.ts -t "reads the exact Java source file referenced by a diagnostic URI"
```

Observed failure:

```text
candidate-2-workspace_source
status: "skipped"
summary: "No vanilla source request detected for source.bundle."
```

The failed output showed that the diagnostic URI was turned into:

```text
Java diagnostic source files: src/main/java/example/Broken.java
```

The original diagnostic URI pointed at:

```text
module-a/src/main/java/example/Broken.java
```

So the source bundle looked for the wrong file and skipped workspace source evidence.

## Real Request Output
Command:

```bash
pnpm exec tsx tmp/java-diagnostics-workspace-source-bridge-real-output.ts
```

Observed output:

```json
{
  "trace": {
    "contextCandidateIds": [
      "candidate-1-java_diagnostics"
    ],
    "selectedCandidateId": "candidate-2-workspace_source"
  },
  "javaDiagnostics": {
    "totalDiagnostics": 1,
    "files": [
      {
        "relativePath": "module-a/src/main/java/example/Broken.java",
        "diagnosticCount": 1,
        "diagnostics": [
          {
            "message": "RegistryObject cannot be resolved to a type",
            "severity": "error",
            "line": 5,
            "character": 11,
            "source": "jdtls"
          }
        ]
      }
    ]
  },
  "workspaceSource": {
    "source": "workspace_source",
    "references": [
      {
        "relativePath": "module-a/src/main/java/example/Broken.java",
        "kind": "java",
        "symbol": "Broken",
        "contentPreview": "package example;\n\nfinal class Broken {\n  private RegistryObject<?> missing;"
      }
    ]
  }
}
```

This confirms that the request can progress from Java diagnostics context into real workspace source content without the user mentioning a fully qualified class name.

## Verification Commands
```bash
pnpm exec tsx tmp/java-diagnostics-workspace-source-bridge-real-output.ts
pnpm exec vitest run apps/mcp-server/src/request-executor.test.ts -t "reads the exact Java source file referenced by a diagnostic URI"
pnpm exec vitest run apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/workspace-analyze-executor.test.ts apps/mcp-server/src/source-bundle-workspace-executor.test.ts
pnpm exec tsc -b apps/mcp-server --pretty false
pnpm --filter @mcpskill/mcp-server test
pnpm typecheck
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
git diff --check
```

## Current Results
`pnpm exec tsx tmp/java-diagnostics-workspace-source-bridge-real-output.ts`

```json
{
  "trace": {
    "contextCandidateIds": [
      "candidate-1-java_diagnostics"
    ],
    "selectedCandidateId": "candidate-2-workspace_source"
  },
  "javaDiagnostics": {
    "totalDiagnostics": 1,
    "files": [
      {
        "relativePath": "module-a/src/main/java/example/Broken.java",
        "diagnosticCount": 1,
        "diagnostics": [
          {
            "message": "RegistryObject cannot be resolved to a type",
            "severity": "error",
            "line": 5,
            "character": 11,
            "source": "jdtls"
          }
        ]
      }
    ]
  },
  "workspaceSource": {
    "source": "workspace_source",
    "references": [
      {
        "relativePath": "module-a/src/main/java/example/Broken.java",
        "kind": "java",
        "symbol": "Broken",
        "contentPreview": "package example;\n\nfinal class Broken {\n  private RegistryObject<?> missing;"
      }
    ]
  }
}
```

`pnpm exec vitest run apps/mcp-server/src/request-executor.test.ts -t "reads the exact Java source file referenced by a diagnostic URI"`

```text
Test Files  1 passed (1)
Tests       1 passed | 3 skipped (4)
```

`pnpm exec vitest run apps/mcp-server/src/request-executor.test.ts apps/mcp-server/src/workspace-analyze-executor.test.ts apps/mcp-server/src/source-bundle-workspace-executor.test.ts`

```text
Test Files  3 passed (3)
Tests       10 passed (10)
```

`pnpm exec tsc -b apps/mcp-server --pretty false`

```text
exit code 0
```

`pnpm --filter @mcpskill/mcp-server test`

```text
Test Files  26 passed (26)
Tests       72 passed (72)
```

`pnpm typecheck`

```text
exit code 0
```

`pnpm test`

```text
Test Files  74 passed (74)
Tests       236 passed (236)
```

500-line source/test guard:

```text
no files reported
```

Go cleanup guard:

```text
no files reported
```

`git diff --check`

```text
exit code 0
```
