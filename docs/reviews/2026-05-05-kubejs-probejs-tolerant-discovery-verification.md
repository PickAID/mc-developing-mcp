# KubeJS ProbeJS Tolerant Discovery Verification

Date: 2026-05-05

## Scope

Task D improved KubeJS/ProbeJS TypeScript discovery tolerance in the language service without treating KubeJS scripts as a generic JavaScript project.

Changed implementation:

- `packages/kubejs-language-service/src/probejs-project.ts`

Changed tests:

- `packages/kubejs-language-service/src/probejs-project.test.ts`

## Behavior Added

- ProbeJS declaration discovery now checks KubeJS-specific ProbeJS bases: `.probe`, `.probejs`, `probe`, `probejs`, `kubejs/probe`, `kubejs/.probe`, `kubejs/probejs`, and `kubejs/.probejs`.
- Scoped discovery still prefers scope plus shared declarations when scoped roots exist.
- Legacy fallback still supports flat declarations and generated declarations, with absolute-path de-duplication for overlapping base/generated roots.
- Snippet discovery now includes VS Code `.code-snippets` plus ProbeJS text snippets under KubeJS ProbeJS `snippets` folders.
- Discovery remains bounded by existing declaration file budgets and does not scan arbitrary JavaScript project locations.

## Evidence

Targeted command run:

```sh
pnpm --filter @mcpskill/kubejs-language-service test
```

Result:

- 4 test files passed.
- 14 tests passed.

New returned-value coverage:

- `kubejs/probejs/server/events.d.ts` and `kubejs/probejs/shared/globals.d.ts` are returned for server scope discovery with exact byte totals.
- `kubejs/probejs/snippets/recipes.txt` is returned as a snippet file while unrelated JSON in that snippet folder is ignored.

