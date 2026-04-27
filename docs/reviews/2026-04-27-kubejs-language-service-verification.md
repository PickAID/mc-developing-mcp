# KubeJS Language Service Verification

Date: 2026-04-27

Scope:

- `packages/kubejs-language-service`
- Root project reference in `tsconfig.json`

## Built Layer

Created package:

```text
@mcpskill/kubejs-language-service
```

Implemented modules:

- `scope.ts`: maps KubeJS script paths to `server`, `startup`, `client`, or `shared`.
- `probejs-project.ts`: selects scope-aware ProbeJS `.d.ts` files and `.vscode/*.code-snippets`.
- `language-service.ts`: creates an in-process TypeScript `LanguageService` for KubeJS scripts.
- `diagnostics.ts`: converts TypeScript diagnostics into compact MCP-safe diagnostics.
- `cache.ts`: small LRU cache with explicit `dispose()` calls.

The package is intentionally not wired into MCP public tools yet. This stage is the bottom-layer service.

## Actual Unit Return Values

### Scope Resolver

Input:

```ts
const workspaceRoot = "/pack";
```

Observed:

```ts
classifyKubeJsScriptScope("/pack/kubejs/server_scripts/example.js", workspaceRoot)
// "server"

classifyKubeJsScriptScope("/pack/kubejs/startup_scripts/example.js", workspaceRoot)
// "startup"

classifyKubeJsScriptScope("/pack/kubejs/client_scripts/example.js", workspaceRoot)
// "client"

classifyKubeJsScriptScope("/pack/local/kubejs/server_scripts/example.js", workspaceRoot)
// "server"

classifyKubeJsScriptScope("/pack/kubejs/lib/helpers.js", workspaceRoot)
// "shared"
```

### ProbeJS Project Discovery

Synthetic scoped ProbeJS input:

```text
.probe/server/server.d.ts
.probe/shared/shared.d.ts
.probe/startup/startup.d.ts
.vscode/probe.code-snippets
```

Observed for `scope: "server"`:

```ts
result.declarationFiles.map((file) => file.relativePath)
// [".probe/server/server.d.ts", ".probe/shared/shared.d.ts"]

result.snippetFiles.map((file) => file.relativePath)
// [".vscode/probe.code-snippets"]

result.totalDeclarationBytes
// 12

result.truncated
// false
```

Synthetic legacy flat ProbeJS input:

```text
.probe/legacy.d.ts
```

Observed for `scope: "startup"`:

```ts
result.declarationFiles.map((file) => file.relativePath)
// [".probe/legacy.d.ts"]

result.totalDeclarationBytes
// 6
```

Budget behavior:

```ts
discoverProbeJsLanguageProject({
  workspaceRoot,
  scope: "server",
  maxDeclarationFiles: 1
})

result.declarationFiles.map((file) => file.relativePath)
// [".probe/server/a.d.ts"]

result.totalDeclarationBytes
// 1

result.truncated
// true
```

### TypeScript Language Service

Synthetic declaration:

```ts
declare const ItemEvents: {
  foodEaten(handler: (event: { item: { id: string } }) => void): void;
};
```

Synthetic script:

```js
ItemEvents.foodEaten((event) => {
  event.item.id;
});
```

Observed completion:

```ts
getKubeJsCompletions(project, {
  filePath: scriptPath,
  search: "ItemEvents."
}).entries
// includes { name: "foodEaten", kind: "method" }
```

Observed quick info:

```ts
getKubeJsQuickInfo(project, {
  filePath: scriptPath,
  search: "foodEaten"
}).text
// contains "foodEaten(handler"
```

Observed diagnostics:

```ts
getKubeJsDiagnostics(project, { filePath: scriptPath })
// []
```

Invalid script:

```js
MissingGlobal.call();
```

Observed diagnostics:

```ts
[
  {
    filePath: scriptPath,
    message: "Cannot find name 'MissingGlobal'.",
    code: 2304,
    category: "Error",
    line: 1,
    character: 1
  }
]
```

### Cache

Observed:

```ts
cache.getOrCreate("workspace|server|hash-a", () => first) === first
cache.getOrCreate("workspace|server|hash-a", () => unused) === first
cache.getOrCreate("workspace|server|hash-b", () => second) === second
```

LRU behavior with `maxEntries: 2`:

```ts
cache.getOrCreate("first", () => first)
cache.getOrCreate("second", () => second)
cache.getOrCreate("first", () => unused)
cache.getOrCreate("third", () => third)

first.disposeCalls
// 0

second.disposeCalls
// 1

third.disposeCalls
// 0

cache.size()
// 2
```

Clear behavior:

```ts
cache.clear()

first.disposeCalls
// 1

second.disposeCalls
// 1

cache.size()
// 0
```

## Real LostCivilization Smoke

Workspace:

```text
/Users/gedwen/Library/Application Support/PrismLauncher/instances/LostCivilization/minecraft
```

Script:

```text
kubejs/server_scripts/example.js
```

Command used:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate exec tsx -e "<imports and async smoke runner>"
```

Observed output:

```json
{
  "declarationCount": 533,
  "declarationBytes": 27575199,
  "snippetCount": 2,
  "elapsedMs": 1822,
  "completionCount": 11,
  "completionSample": [
    { "name": "canPickUp", "kind": "function" },
    { "name": "crafted", "kind": "function" },
    { "name": "destroyed", "kind": "function" },
    { "name": "dropped", "kind": "function" },
    { "name": "entityInteracted", "kind": "function" },
    { "name": "firstLeftClicked", "kind": "function" },
    { "name": "firstRightClicked", "kind": "function" },
    { "name": "foodEaten", "kind": "function" }
  ],
  "quickInfo": "function ItemEvents.foodEaten(handler: ((event: $FoodEatenEventJS) => void)): void (+1 overload)",
  "diagnostics": []
}
```

Interpretation:

- The service works against the actual Prism/KubeJS/ProbeJS Legacy layout.
- Loading `server + shared` declarations is heavier than server-only research: `533` declarations and about `27.6MB`.
- This confirms the need for cache and future byte budgets.

## Command Results

### Package Test

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate --filter @mcpskill/kubejs-language-service test
```

Observed:

```text
Test Files  4 passed (4)
Tests  9 passed (9)
```

### Full Test Suite

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate test
```

Observed:

```text
Test Files  52 passed (52)
Tests  158 passed (158)
```

### Typecheck

Command:

```sh
pnpm --dir /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate typecheck
```

Observed:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

Exit code: `0`

### No-Go Check

Command:

```sh
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate -path '*/node_modules' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Observed:

```text

```

Meaning: no Go source/module files were found outside `node_modules`.

### 500 Line Check

Command:

```sh
find /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/packages /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/apps /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate/tests -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | xargs -0 wc -l | awk '$2 != "total" && $1 > 500 { print }'
```

Observed:

```text

```

Largest new package files:

```text
137 packages/kubejs-language-service/src/probejs-project.ts
137 packages/kubejs-language-service/src/language-service.ts
106 packages/kubejs-language-service/src/language-service.test.ts
87  packages/kubejs-language-service/src/probejs-project.test.ts
68  packages/kubejs-language-service/src/types.ts
66  packages/kubejs-language-service/src/cache.ts
61  packages/kubejs-language-service/src/cache.test.ts
```

## Current Limits

- MCP `context.query` integration was added after this bottom-layer verification. See `docs/reviews/2026-04-27-mcp-probejs-language-service-integration-verification.md`.
- The service does not yet parse snippets into semantic result payloads.
- No stale ProbeJS manifest/hash invalidation is implemented yet.
- No TTL-based cache disposal is implemented yet; current cache has explicit LRU cap and `clear()`.
- No KubeJS-specific semantic policy diagnostics are implemented yet.
