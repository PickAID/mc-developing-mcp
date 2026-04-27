# KubeJS Language Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first KubeJS semantic language-service layer backed by ProbeJS `.d.ts` files and TypeScript's in-process `LanguageService`.

**Architecture:** Add `@mcpskill/kubejs-language-service` as a focused package. It maps KubeJS scripts to server/startup/client/shared scopes, selects only the relevant ProbeJS declarations, creates a cached TypeScript language service host, and exposes compact semantic operations for internal `context.query` use.

**Tech Stack:** TypeScript, Vitest, Node filesystem APIs, `typescript` package, existing pnpm monorepo.

---

## File Structure

- Create `packages/kubejs-language-service/package.json`: package metadata and test script.
- Create `packages/kubejs-language-service/tsconfig.json`: project build config.
- Create `packages/kubejs-language-service/src/types.ts`: public interfaces and result shapes.
- Create `packages/kubejs-language-service/src/scope.ts`: KubeJS script path to scope mapping.
- Create `packages/kubejs-language-service/src/probejs-project.ts`: ProbeJS d.ts and snippet discovery for selected scope.
- Create `packages/kubejs-language-service/src/language-service.ts`: in-process TypeScript service host and semantic operations.
- Create `packages/kubejs-language-service/src/diagnostics.ts`: diagnostic formatting and budgeting.
- Create `packages/kubejs-language-service/src/index.ts`: package exports.
- Create tests beside each component.
- Modify root `tsconfig.json`: add project reference.
- Later integration step will modify `apps/mcp-server` and `packages/service-profile`; not part of the first bottom-layer slice unless base package is green.

## Task 1: Scope Resolver

**Files:**

- Create: `packages/kubejs-language-service/src/scope.test.ts`
- Create: `packages/kubejs-language-service/src/scope.ts`
- Create: `packages/kubejs-language-service/src/types.ts`
- Create: `packages/kubejs-language-service/src/index.ts`
- Create: `packages/kubejs-language-service/package.json`
- Create: `packages/kubejs-language-service/tsconfig.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Write the failing scope tests**

```ts
expect(classifyKubeJsScriptScope("/pack/kubejs/server_scripts/a.js", "/pack")).toBe("server");
expect(classifyKubeJsScriptScope("/pack/kubejs/startup_scripts/a.js", "/pack")).toBe("startup");
expect(classifyKubeJsScriptScope("/pack/kubejs/client_scripts/a.js", "/pack")).toBe("client");
expect(classifyKubeJsScriptScope("/pack/local/kubejs/server_scripts/a.js", "/pack")).toBe("server");
expect(classifyKubeJsScriptScope("/pack/kubejs/lib/a.js", "/pack")).toBe("shared");
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec vitest run --root /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate packages/kubejs-language-service/src/scope.test.ts
```

Expected: FAIL because `@mcpskill/kubejs-language-service` does not exist.

- [ ] **Step 3: Implement scope resolver**

Create `KubeJsScriptScope = "server" | "startup" | "client" | "shared"` and `classifyKubeJsScriptScope(filePath, workspaceRoot)`.

- [ ] **Step 4: Run test to verify GREEN**

Expected: `1 passed`.

## Task 2: ProbeJS Scope Project Discovery

**Files:**

- Create: `packages/kubejs-language-service/src/probejs-project.test.ts`
- Create: `packages/kubejs-language-service/src/probejs-project.ts`
- Modify: `packages/kubejs-language-service/src/types.ts`
- Modify: `packages/kubejs-language-service/src/index.ts`

- [ ] **Step 1: Write failing tests**

Tests must prove:

- server scope includes `.probe/server/**/*.d.ts` and `.probe/shared/**/*.d.ts`.
- startup scope includes `.probe/startup/**/*.d.ts` and `.probe/shared/**/*.d.ts`.
- client scope includes `.probe/client/**/*.d.ts` and `.probe/shared/**/*.d.ts`.
- legacy flat `.probe/*.d.ts` is used when scoped directories are missing.
- discovery returns byte counts and truncation flags under a max file budget.

- [ ] **Step 2: Run test to verify RED**

Expected: FAIL because `discoverProbeJsLanguageProject` is missing.

- [ ] **Step 3: Implement discovery**

Implement sorted deterministic walking and return:

```ts
{
  workspaceRoot,
  scope,
  declarationFiles,
  snippetFiles,
  totalDeclarationBytes,
  truncated
}
```

- [ ] **Step 4: Run test to verify GREEN**

Expected: discovery tests pass.

## Task 3: TypeScript Language Service Host

**Files:**

- Create: `packages/kubejs-language-service/src/language-service.test.ts`
- Create: `packages/kubejs-language-service/src/language-service.ts`
- Create: `packages/kubejs-language-service/src/diagnostics.ts`
- Modify: `packages/kubejs-language-service/src/types.ts`
- Modify: `packages/kubejs-language-service/src/index.ts`
- Modify: `packages/kubejs-language-service/package.json`

- [ ] **Step 1: Write failing semantic tests**

Synthetic project:

```ts
declare const ItemEvents: {
  foodEaten(handler: (event: { item: { id: string } }) => void): void
};
```

Script:

```js
ItemEvents.foodEaten((event) => {
  event.item.id;
});
```

Tests must prove:

- completion after `ItemEvents.` includes `foodEaten`.
- quick info on `foodEaten` includes `foodEaten(handler`.
- diagnostics for valid script are empty.
- diagnostics for `MissingGlobal.call()` include `Cannot find name`.

- [ ] **Step 2: Run test to verify RED**

Expected: FAIL because language-service functions are missing.

- [ ] **Step 3: Implement minimal service**

Use `typescript.createLanguageService` with:

```ts
{
  allowJs: true,
  checkJs: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  types: []
}
```

Expose:

- `createKubeJsLanguageServiceProject(options)`
- `getKubeJsCompletions(project, input)`
- `getKubeJsQuickInfo(project, input)`
- `getKubeJsDiagnostics(project, input)`

- [ ] **Step 4: Run test to verify GREEN**

Expected: language-service tests pass.

## Task 4: Cache And Disposal

**Files:**

- Create: `packages/kubejs-language-service/src/cache.test.ts`
- Create: `packages/kubejs-language-service/src/cache.ts`
- Modify: `packages/kubejs-language-service/src/index.ts`

- [ ] **Step 1: Write failing cache tests**

Tests must prove:

- same workspace/scope/manifest key returns the same project instance.
- changing manifest key returns a new instance.
- LRU cap disposes the least recently used project.
- `clear()` disposes all active projects.

- [ ] **Step 2: Run test to verify RED**

Expected: FAIL because cache module is missing.

- [ ] **Step 3: Implement cache**

Implement small deterministic cache with explicit `dispose()` calls.

- [ ] **Step 4: Run test to verify GREEN**

Expected: cache tests pass.

## Task 5: Verification And Review Doc

**Files:**

- Create: `docs/reviews/2026-04-27-kubejs-language-service-verification.md`

- [ ] **Step 1: Run package tests**

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/kubejs-language-service test
```

- [ ] **Step 2: Run full tests**

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
```

- [ ] **Step 3: Run typecheck**

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
```

- [ ] **Step 4: Run no-Go and 500-line checks**

```sh
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/tests -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

- [ ] **Step 5: Write review doc**

Record actual return values for completions, quick info, diagnostics, package test output, full test output, typecheck output, no-Go output, and 500-line output.

## Self-Review

- Scope is limited to the bottom-layer language service package.
- MCP integration is intentionally deferred until the package is verified.
- No Go files are planned.
- All source/test files are designed to stay under 500 lines.
- The plan does not require committing because this workspace is an uncommitted `SKillUpdate` implementation area and the user has not requested commits.
