# KubeJS TypeScript Language Service Research

Date: 2026-04-27

Scope:

- KubeJS `.js` script authoring support
- ProbeJS Legacy `.probe/**` and `.vscode/*.code-snippets`
- MCP internal context pipeline, especially `context.query` route step `probejs_types`
- Future implementation package candidate: `@mcpskill/kubejs-language-service`

## Conclusion

The best next layer is an in-process TypeScript `LanguageService` wrapper specialized for KubeJS, not a generic JavaScript project model and not an external `tsserver` process as the default path.

Reason:

- KubeJS scripts are JavaScript files, but their real API surface comes from Minecraft runtime + ProbeJS generated declarations. Treating them as ordinary Node/browser JS will create false guidance.
- TypeScript already provides the core engine needed for JS IntelliSense, quick info, completions, definitions, and diagnostics when `allowJs` and `checkJs` are enabled.
- ProbeJS already emits `.d.ts` files and VS Code snippets. The missing layer is not "more text search"; it is a scope-aware language-service host that loads the right ProbeJS files for `server_scripts`, `startup_scripts`, and `client_scripts`.
- MCP should keep the public surface progressive. This should upgrade internal `context.query` and harness behavior rather than exposing many new standalone tools.

## Current Local State

Existing code:

- `@mcpskill/kubejs-types-adapter` discovers ProbeJS roots and classifies resources as `dts`, `snippet`, `item`, `registry`, or `other`.
- `@mcpskill/service-profile` reports ProbeJS type availability and injects guidance: use ProbeJS/d.ts before generic JS assumptions.
- `@mcpskill/agent-harness` routes KubeJS authoring through `probejs_types -> docs_lookup`.
- `apps/mcp-server` already has a `context.query` executor slot for `probejs_types`.

Current gap:

- There is no semantic JavaScript/TypeScript language service layer.
- Existing ProbeJS support is discovery, byte-budgeted read, and line search.
- Search cannot reliably answer "what is the type at this cursor", "what completions are valid here", "where is this symbol declared", or "is this KubeJS file semantically broken".

## Real Environment Probe

Project used:

```text
/Users/gedwen/Library/Application Support/PrismLauncher/instances/LostCivilization/minecraft
```

Existing MCP `kubejs_project_context` result:

```json
{
  "minecraft_version": "1.20.1",
  "loader": "forge",
  "kubejs_roots": ["kubejs", "local/kubejs"],
  "probe_dirs": [".probe", ".vscode"],
  "script_counts": {
    "startup_scripts": 1,
    "server_scripts": 1,
    "client_scripts": 1,
    "local_startup_scripts": 0,
    "local_server_scripts": 0
  },
  "resource_counts": {
    "data": 6,
    "assets": 9,
    "config": 3
  },
  "symbol_count": 2121,
  "symbol_count_by_kind": {
    "function": 1988,
    "snippet": 133
  },
  "truncated": true
}
```

ProbeJS filesystem facts:

```text
.probe file count: 1093
.probe size: 45M
.vscode size: 1.5M
.probe/server d.ts count: 277
.probe/server d.ts size: 8.0M
```

In-process TypeScript language service proof:

```json
{
  "dtsCount": 277,
  "probeDtsMegabytes": 8,
  "elapsedMs": 864,
  "completionEntryCount": 11,
  "sampleCompletions": [
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
  "syntacticDiagnostics": [],
  "semanticDiagnostics": []
}
```

Warm query timings against the same service:

```json
[
  { "run": 1, "ms": 817, "completions": 11, "quickInfo": true, "diagnostics": 0 },
  { "run": 2, "ms": 2, "completions": 11, "quickInfo": true, "diagnostics": 0 },
  { "run": 3, "ms": 0, "completions": 11, "quickInfo": true, "diagnostics": 0 },
  { "run": 4, "ms": 1, "completions": 11, "quickInfo": true, "diagnostics": 0 },
  { "run": 5, "ms": 5, "completions": 11, "quickInfo": true, "diagnostics": 0 },
  { "run": 6, "ms": 1, "completions": 11, "quickInfo": true, "diagnostics": 0 }
]
```

Interpretation:

- Cold-start cost is acceptable if cached per workspace and script scope.
- Warm semantic queries are cheap enough to use inside `context.query`.
- Loading one scope's `.d.ts` is materially better than loading all `.probe` content for every query.

## Source Findings

Official TypeScript API surface supports this design:

- `createLanguageService(host, ...)` is exposed by the `typescript` package.
- `LanguageServiceHost` supplies script file names, versions, snapshots, compiler settings, current directory, file reads, and module resolution hooks.
- `LanguageService` exposes diagnostics, completions, quick info, definition, references, navigation, formatting, code fixes, and inlay hints.
- `CompilerOptions` includes `allowJs` and `checkJs`, which are the required switches for JS files.
- `IScriptSnapshot` is immutable and versioned, which maps well to MCP-managed file versions and cache invalidation.

External references used:

- TypeScript language service API wiki: https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API
- TypeScript standalone server wiki: https://github.com/microsoft/TypeScript/wiki/Standalone-Server-%28tsserver%29
- TypeScript language service plugin wiki: https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin
- VS Code JavaScript language docs: https://code.visualstudio.com/docs/languages/javascript
- VS Code jsconfig docs: https://code.visualstudio.com/docs/languages/jsconfig
- typescript-language-server README: https://github.com/typescript-language-server/typescript-language-server
- KubeJS ProbeJS docs: https://kubejs.com/wiki/addons/probejs

Local source inspected:

- `node_modules/typescript/lib/typescript.d.ts`
- `packages/kubejs-types-adapter/src/*`
- `packages/service-profile/src/*`
- `packages/agent-harness/src/*`
- `apps/mcp-server/src/*`

## Compared Options

### Option A: Text Search Plus d.ts Read Only

Keep expanding `@mcpskill/kubejs-types-adapter` with smarter search and snippet parsing.

Pros:

- Simple and robust.
- Low memory.
- Good for registry item/snippet lookup.
- Easy to keep deterministic.

Cons:

- Cannot answer cursor-level type questions.
- Cannot reliably produce completions, definitions, references, or diagnostics.
- Still wastes tokens because agents must read fragments and reason manually.
- Does not solve the core problem of agents treating KubeJS as generic JS.

Verdict:

- Keep as fallback and as snippet/item/registry source.
- Not enough as the primary KubeJS intelligence layer.

### Option B: External `tsserver` Process

Start TypeScript's standalone server and communicate over its protocol, like editor integrations do.

Pros:

- Close to VS Code behavior.
- Protocol has many commands: open, change, quickinfo, completions, diagnostics, definition, references, project info.
- Can support future editor-parity workflows.

Cons:

- Adds another process lifecycle manager similar to JDTLS.
- Requires tsserver protocol framing, request sequencing, cancellation, project reload, and process restart logic.
- Harder to inject KubeJS-specific virtual project rules without writing tsserver plugins or generated config files.
- More overhead for MCP use cases where we only need focused, read-mostly semantic queries.

Verdict:

- Useful as a future compatibility backend.
- Not recommended as the default first implementation.

### Option C: In-Process TypeScript `LanguageService`

Use the `typescript` package directly. Build a KubeJS-aware `LanguageServiceHost` that loads workspace `.js` files plus the correct ProbeJS `.d.ts` scope.

Pros:

- No extra process.
- Direct control over file budgets, snapshots, versions, project roots, and `.d.ts` scope selection.
- Can expose only focused internal operations to MCP.
- Can blend ProbeJS snippets/items/registries with language-service results.
- Cold/warm measurements on the real modpack are strong enough for MCP usage.

Cons:

- Must implement our own host, cache, and invalidation logic.
- Some VS Code behavior from tsserver plugins may not be identical.
- TypeScript diagnostics are necessary but not sufficient for KubeJS domain rules.

Verdict:

- Recommended primary design.
- Add optional `tsserver` backend later only if editor parity becomes necessary.

## Recommended Architecture

Package:

```text
packages/kubejs-language-service
```

Public package modules:

- `project.ts`: build a KubeJS language project from workspace facts.
- `scope.ts`: map JS script paths to `server`, `startup`, `client`, or `shared`.
- `probejs-project.ts`: discover and select `.probe/<scope>/**/*.d.ts`, `.probe/shared/**/*.d.ts`, `.vscode/*.code-snippets`.
- `language-service.ts`: create and manage the in-process TypeScript language service.
- `semantic-query.ts`: focused query API for MCP/harness.
- `diagnostics.ts`: map TypeScript diagnostics into budgeted MCP-safe output.
- `snippets.ts`: parse VS Code snippets and registry/item completions.
- `cache.ts`: workspace/scope cache with invalidation and disposal.
- `types.ts`: shared interfaces only.

No source/test file should exceed 500 lines.

## Data Flow

1. Workspace detector identifies KubeJS and ProbeJS signals.
2. Service profile discovers ProbeJS roots and records `kubejsLanguageService` capability.
3. Harness keeps public route as `probejs_types`.
4. `context.query` receives a KubeJS request.
5. Internal KubeJS semantic executor:
   - classifies target script scope from path or request text,
   - builds or reuses a cached language service,
   - chooses one focused operation,
   - returns compact evidence.
6. If language service evidence is missing, fallback order is:
   - ProbeJS text/snippet/item/registry search,
   - structured KubeJS docs,
   - general docs.

## Script Scope Rules

Path mapping:

- `kubejs/server_scripts/**` and `local/kubejs/server_scripts/**` -> server scope.
- `kubejs/startup_scripts/**` and `local/kubejs/startup_scripts/**` -> startup scope.
- `kubejs/client_scripts/**` -> client scope.
- Unknown `.js` path under `kubejs/**` -> shared plus inferred scope from content if possible.

ProbeJS type inclusion:

- Server script project includes `.probe/server/**/*.d.ts` plus `.probe/shared/**/*.d.ts`.
- Startup script project includes `.probe/startup/**/*.d.ts` plus `.probe/shared/**/*.d.ts`.
- Client script project includes `.probe/client/**/*.d.ts` plus `.probe/shared/**/*.d.ts`.
- If scoped directories are missing, fallback to legacy flat `.probe/**/*.d.ts` with strict file budget.
- `.vscode/probe.code-snippets` and related snippets are parsed separately, not fed into TypeScript.

## Compiler Options

Recommended generated compiler options:

```ts
{
  allowJs: true,
  checkJs: true,
  noEmit: true,
  skipLibCheck: true,
  target: "ES2020",
  module: "CommonJS",
  moduleResolution: "Node10",
  types: []
}
```

Notes:

- `skipLibCheck` avoids spending time on generated ProbeJS declaration internals.
- `types: []` prevents Node/browser ambient types from polluting KubeJS unless explicitly needed.
- The service should not create or require a real `jsconfig.json`.
- If the user already has `jsconfig.json`, read it as input evidence but do not blindly trust it over KubeJS scope rules.

## MCP-Facing Behavior

Do not expose many new public tools.

Keep the public route progressive:

```text
context.query
```

Internally support these semantic intents:

- `kubejs.quick_info`: type at symbol or cursor.
- `kubejs.completions`: valid API names at cursor or inferred expression.
- `kubejs.diagnostics`: syntax and semantic diagnostics for one file.
- `kubejs.definition`: declaration source path and line for a symbol.
- `kubejs.symbol_context`: compact bundle for a requested symbol, combining quick info, declaration, and snippets.
- `kubejs.snippet_lookup`: registry/item/snippet suggestions when the query is ID-like or registry-like.

The external MCP response should return evidence, not full files:

```ts
{
  matched: true,
  summary: "Resolved KubeJS symbol from ProbeJS TypeScript language service.",
  payload: {
    source: "kubejs_language_service",
    scope: "server",
    operation: "quick_info",
    symbol: "ItemEvents.foodEaten",
    quickInfo: "function ItemEvents.foodEaten(handler: ((event: $FoodEatenEventJS) => void)): void (+1 overload)",
    declaration: {
      path: ".probe/server/global/events.d.ts",
      line: 123
    },
    diagnostics: []
  }
}
```

## KubeJS-Specific Rules Beyond TypeScript

TypeScript diagnostics are not enough. The language service should be paired with KubeJS domain checks:

- KubeJS is not a generic JS/Node project.
- Avoid persistent `console.*` in committed scripts; allow it only behind explicit debug gates or in diagnostics mode.
- Prefer lifecycle/domain organization over arbitrary helper sprawl.
- Avoid casual top-level `const` sprawl when named functions or event-local values are clearer.
- Do not assume Node globals, browser globals, bundlers, npm packages, or module imports.
- Script scope matters: startup-only APIs should not be used in server/client scripts, and server-only APIs should not be used in startup/client scripts.
- Datapack content under `kubejs/data/**` and assets under `kubejs/assets/**` stay in datapack/resourcepack pipeline, not generic JS pipeline.

These should live in a small KubeJS semantic rules module, not in TypeScript compiler config.

## Cache And Performance Policy

Cache key:

```text
workspaceRoot + minecraftVersion + loader + probeScope + probeSettingsHash + dtsManifestHash
```

Invalidation inputs:

- `.probe/probe-settings.json` `modHash` and `registryHash`.
- `.probe/**/*.d.ts` file mtimes/sizes.
- `.vscode/*.code-snippets` mtimes/sizes.
- KubeJS script file version.

Memory policy:

- One `LanguageService` per workspace/scope, lazy-created.
- Idle TTL disposal, default 10 minutes.
- Hard cap on active services, default 4.
- Hard cap on loaded declaration bytes per scope, default 32MB.
- On pressure, evict least recently used service with `service.dispose()`.

Performance modes:

- `balanced`: default, one scope at a time, no full workspace diagnostics.
- `fast`: snippets/text search first, language service only for exact file/symbol queries.
- `deep`: load all relevant scope declarations and run diagnostics for multiple script files.
- `expensive`: allow cross-scope semantic checks and broader symbol navigation.

This matches the broader project rule: allow spending extra performance when the user or agent explicitly asks for deeper/faster evidence, but keep default UX responsive.

## Failure Modes

If ProbeJS is missing:

- Return a structured "not available" result.
- Suggest generating ProbeJS types from the modpack.
- Fall back to versioned docs, but mark confidence lower.

If `.probe` exists but is stale:

- Detect mismatched `modHash`/`registryHash` when possible.
- Report that language results are from stale generated types.
- Fall back to snippets and docs if semantic service fails.

If TypeScript service fails:

- Dispose the failed service.
- Return actionable error with scope, loaded file count, loaded bytes, and suggested fallback.
- Do not leave a broken cached service.

If diagnostics are noisy:

- Budget by file and total count.
- Suppress generated `.d.ts` diagnostics by default.
- Return KubeJS script diagnostics first.

## Implementation Plan Candidate

This is not approved implementation yet. Suggested first implementation slice:

1. Create `@mcpskill/kubejs-language-service`.
2. Add project/scope discovery with tests using synthetic `.probe/server`, `.probe/startup`, `.probe/client`, `.probe/shared`.
3. Add TypeScript `LanguageServiceHost` with in-memory versioned snapshots.
4. Add `quickInfo`, `completions`, and `diagnostics` APIs.
5. Add cache with TTL/dispose hooks.
6. Integrate as an optional internal `probejs_types` executor in `context.query`.
7. Add real LostCivilization smoke script that prints quick info/completion/diagnostic return values into a review doc.

Not in first slice:

- External `tsserver` backend.
- TypeScript Server Plugin.
- Full refactor/codefix operations.
- Writing or generating `jsconfig.json`.

## Recommendation

Proceed with Option C first:

```text
in-process TypeScript LanguageService
+ KubeJS scope resolver
+ ProbeJS d.ts/snippet adapter
+ KubeJS semantic rule layer
+ internal context.query integration
```

Keep Option B as a future backend only if we later need editor parity with VS Code or external language server clients.
