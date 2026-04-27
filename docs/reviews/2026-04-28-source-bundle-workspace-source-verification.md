# Source Bundle Workspace Source Verification
Date: 2026-04-28
Author: m1hono
Scope: `apps/mcp-server` local workspace execution path for `source.bundle`

## Change
`source.bundle` now resolves local workspace files before looking at Gradle source jars, dependency jars, or optional corpora.

This closes a routing gap: `workspace_source` already meant “inspect exact workspace source or build files before docs”, but the executor previously handled vanilla source, Gradle source archives, and dependency archives without first reading project-local Java or Gradle files.

## Execution Order
For non-vanilla `workspace_source` requests:

1. Local workspace source/build files.
2. Gradle sources archives.
3. Gradle dependency binary archives for class ownership.
4. Fallback executor/docs.

This keeps the cheapest and most authoritative evidence first.

## RED Test
Command:

```bash
pnpm exec vitest run apps/mcp-server/src/source-bundle-workspace-executor.test.ts
```

Observed failure before implementation:

```text
source.bundle workspace source execution > reads local Gradle files before falling back to external sources
expected { matched: false, summary: "No vanilla source request detected for source.bundle." } to match object { matched: true, ... }

source.bundle workspace source execution > reads local Java source for qualified project class references
expected { matched: false, ... } to match object { matched: true, ... }
```

## Implemented Behavior
- Reads requested `build.gradle`, `build.gradle.kts`, `settings.gradle`, `settings.gradle.kts`, `gradle.properties`, and `libs.versions.toml`.
- Resolves qualified local Java class references to `src/**/java/<package>/<Class>.java`.
- Ignores low-value platform prefixes such as `java.*`, `net.minecraft.*`, and `com.mojang.*` in this local workspace path.
- Caps returned local references to 8 files.
- Skips binary files and files larger than 128 KiB.
- Short-circuits immediately when local workspace evidence is found, avoiding Gradle cache scans.

## Real Return Values
Command:

```bash
pnpm exec tsx tmp/source-bundle-workspace-smoke.ts
```

Observed Gradle result excerpt:

```json
{
  "candidate": {
    "id": "candidate-1-workspace_source",
    "routeStep": "workspace_source",
    "preferredTool": "source.bundle",
    "reason": "Inspect exact workspace source or build files before docs."
  },
  "result": {
    "matched": true,
    "summary": "Resolved 1 local workspace source file(s).",
    "payload": {
      "source": "workspace_source",
      "mode": "local_files",
      "references": [
        {
          "kind": "gradle",
          "relativePath": "build.gradle",
          "content": "plugins { id \"net.neoforged.gradle.userdev\" version \"7.0.0\" }\\ndependencies {\\n  implementation \"com.example:library:1.0.0\"\\n}\\n"
        }
      ],
      "truncated": false
    }
  }
}
```

Observed Java result excerpt:

```json
{
  "result": {
    "matched": true,
    "summary": "Resolved 1 local workspace source file(s).",
    "payload": {
      "source": "workspace_source",
      "mode": "local_files",
      "references": [
        {
          "kind": "java",
          "symbol": "com.example.project.LocalCaller",
          "relativePath": "src/main/java/com/example/project/LocalCaller.java",
          "content": "package com.example.project;\\npublic final class LocalCaller {\\n  public void call() {}\\n}\\n"
        }
      ],
      "truncated": false
    }
  }
}
```

## Verification Commands
```bash
pnpm exec vitest run apps/mcp-server/src/source-bundle-workspace-executor.test.ts
pnpm typecheck
pnpm --filter @mcpskill/mcp-server test
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

## Current Results
- `pnpm exec vitest run apps/mcp-server/src/source-bundle-workspace-executor.test.ts`: 2 tests passed.
- `pnpm typecheck`: `tsc -b --pretty false` passed.
- `pnpm --filter @mcpskill/mcp-server test`: 19 test files passed, 51 tests passed.
- `pnpm test`: 67 test files passed, 212 tests passed.
- 500-line source/test check: no files reported.
- Go residual check: no files reported.
