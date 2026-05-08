# Vanilla Source Adapter Maintainability Verification

Date: 2026-05-08
Author: m1hono

## Scope

This slice reduced the highest-risk source file in the active TypeScript MCP
codebase. `packages/vanilla-source-adapter/src/resolve.ts` was at 497 lines,
which left almost no room under the 500-line source-code limit.

The change is behavior-preserving:

- Moved `VanillaSourceReference` into `types.ts`.
- Moved source-index lookup, chunk fallback, version filtering, and next-read
  formatting into `indexed-references.ts`.
- Kept `resolve.ts` responsible for orchestration: version resolution,
  confirmation/acquisition, installed source-pack reads, and scan fallback.
- Updated the package test script to include both normal source-pack resolution
  and source-index resolution tests.

## Verification

Commands:

```bash
pnpm exec tsc -b packages/shared-types packages/source-index packages/source-package-manager packages/vanilla-source-adapter
pnpm exec vitest run packages/vanilla-source-adapter/src/resolve.test.ts packages/vanilla-source-adapter/src/resolve-source-index.test.ts
pnpm --filter @mcpskill/vanilla-source-adapter test
```

Results:

```text
TypeScript build: passed
focused vitest: 2 files / 12 tests passed
package test script: 2 files / 12 tests passed
```

Line counts after split:

```text
packages/vanilla-source-adapter/src/resolve.ts: 320
packages/vanilla-source-adapter/src/indexed-references.ts: 191
packages/vanilla-source-adapter/src/types.ts: 12
```

## Outcome

The vanilla source adapter now has enough line-count headroom for future
bugfixes without violating the source-code maintainability rule. The source
index path is also part of the package-level test command, reducing the risk of
future regressions in compact SQLite source evidence.
