# Agent Harness Task Route Test Split Verification
Date: 2026-05-04
Author: m1hono

## Scope
This slice splits crash routing coverage out of
`packages/agent-harness/src/task-route.test.ts`.

Reason: the file reached 490 lines after loader dependency crash routing. It
was still under the 500-line limit, but the next routing change would likely
violate the maintainability guard.

## Red
This is a maintainability split, not a behavior change.

Pre-split line count:

```text
490 packages/agent-harness/src/task-route.test.ts
```

## Green
Focused package test:

```bash
pnpm --filter @mcpskill/agent-harness test
```

Result:

```text
✓ packages/agent-harness/src/task-route-crash.test.ts (2 tests) 2ms
✓ packages/agent-harness/src/task-route.test.ts (11 tests) 4ms

Test Files  10 passed (10)
Tests  49 passed (49)
```

TypeScript build:

```bash
pnpm tsc -b
```

Result: no output, exit code 0.

Repository guards:

```bash
git diff --check
find apps packages -path '*/dist/*' -prune -o \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Result: no output from both guard commands.

## Actual Return Values
Crash routing coverage still returns:

```json
{
  "steps": [
    "log_files",
    "external_mod_resolution",
    "workspace_source",
    "docs_lookup"
  ],
  "preferredTools": [
    "workspace.analyze",
    "context.query",
    "source.bundle"
  ]
}
```

Modpack crash routing with local mod archives still returns:

```json
{
  "steps": [
    "log_files",
    "mod_archive_content",
    "external_mod_resolution",
    "workspace_source",
    "docs_lookup"
  ],
  "preferredTools": [
    "workspace.analyze",
    "context.query",
    "source.bundle"
  ]
}
```

## Line Counts
After:

```text
374 packages/agent-harness/src/task-route.test.ts
86 packages/agent-harness/src/task-route-crash.test.ts
47 packages/agent-harness/src/task-route-test-fixtures.ts
```

## Notes
- `packages/agent-harness/package.json` now includes
  `task-route-crash.test.ts` in the package-level test script.
- Runtime routing code is unchanged in this slice.
