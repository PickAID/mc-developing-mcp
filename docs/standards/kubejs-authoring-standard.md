<!-- markdownlint-disable MD013 MD022 MD032 -->

# KubeJS Authoring Standard
Date: 2026-05-05
Author: m1hono
Scope: `mc-developing-mcp` KubeJS, ProbeJS, datapack/resource-pack, modpack evidence, and scripting guidance

## Purpose

KubeJS is Minecraft lifecycle scripting, not a generic JavaScript project. The MCP must guide agents to use workspace evidence, ProbeJS typings, generated resource summaries, registry data, snippets, and versioned docs before writing or explaining scripts.

This standard defines the required behavior for KubeJS assistance. It is stricter than a style guide: it says what evidence must be checked, which assumptions are invalid, how scripts should be scoped, and how the MCP should avoid token waste in real modpacks.

## Core Rule

An agent must not answer a KubeJS request as if it were Node.js, browser JavaScript, or a generic TypeScript repository.

The correct mental model is:

```text
Minecraft version + loader + KubeJS version/addons
-> script scope
-> lifecycle/event surface
-> ProbeJS/d.ts/snippet/resource evidence
-> registry/item/fluid/tag/recipe evidence
-> local scripts and generated resources
-> docs only for missing or version-specific behavior
```

## Scope Classification

The MCP must classify script paths and requests into lifecycle scopes:

- `startup_scripts`: registration-time work, schema-like definitions, custom registries, block/item/fluid/entity registration where supported, and startup-only events.
- `server_scripts`: recipes, tags, loot, server events, command/server lifecycle logic, gameplay event handlers, and datapack-adjacent work.
- `client_scripts`: client-only visual behavior, UI hooks, client events, viewer-integration hooks where available, and visual/resource tasks.
- `config` or non-script files: configuration, generated data, docs, assets, and support files.
- `lib` or shared helper files: reusable functions only when the workspace pattern clearly uses them.

If the scope is unknown, the agent must ask for or inspect the script path instead of guessing.

## Evidence Priority

The mandatory priority for KubeJS tasks is:

1. Workspace facts: MC version, loader, KubeJS/ProbeJS presence, modpack shape.
2. ProbeJS declarations and TypeScript language service diagnostics.
3. ProbeJS resources: snippets, items, fluids, tags, registries, recipes, classes, attributes, and generated docs.
4. Existing KubeJS scripts in the same scope.
5. Datapack/resource-pack evidence generated or consumed by KubeJS.
6. Mod JAR archive evidence for external registries/items/recipes when local scripts reference mod content.
7. Versioned KubeJS/addon docs.
8. General scripting advice only after evidence is missing.

The MCP should prefer `probejs_types` before docs for KubeJS authoring, and should include `mod_archive_content` when a modpack has JAR evidence and the request references external items, registries, recipes, or crash causes.

## ProbeJS Standard

ProbeJS is the first-class evidence source for KubeJS.

The MCP should support:

- `.probe`
- `.probejs`
- `probe`
- `probejs`
- `kubejs/probe`
- `kubejs/probejs`
- `kubejs/.probe`
- `kubejs/.probejs`
- scoped declarations such as `server`, `startup`, `client`, and `shared`
- legacy flat declarations
- generated snippets
- item, fluid, tag, registry, class, and attribute resources
- d.ts string literal extraction for resource IDs

ProbeJS evidence should be compact:

- Return counts and matched symbols first.
- Return relevant snippets only by query terms.
- Return only matching item/registry/tag entries by default.
- Return unknown ProbeJS files as bounded previews with low confidence.
- Cache parsed summaries for repeated queries in one MCP process.

The agent should never invent KubeJS API names when ProbeJS exists and disagrees.

## Native Event Standard

Native event APIs are version- and addon-sensitive. The MCP must verify them from
runtime facts, ProbeJS/d.ts, source/docs evidence, or existing scripts before
recommending code.

Rules verified from the current MCP corpus:

- In core KubeJS 1.20.1, `ForgeEvents.onEvent(...)` and `ForgeModEvents.onEvent(...)` are bound only for `startup_scripts`.
- In core KubeJS 1.20.1, native Forge event handlers in `server_scripts` or `client_scripts` require an addon-provided native event surface.
- In 1.20.1 with an appropriate native-event addon, `NativeEvents.onEvent(...)` can be available in startup, server, and client scripts. The MCP must confirm the addon or existing ProbeJS declaration before relying on it.
- In core KubeJS 1.21.1+, `NativeEvents` is built into KubeJS and can register native event listeners by script type.
- Native event handlers receive raw platform event objects, so mutability must be verified from the platform event class. A getter does not imply a setter.
- Native event handlers must not be moved across script scopes unless the API surface for that scope is confirmed.

Invalid answer patterns:

- Suggesting `ForgeEvents.onEvent(...)` in `server_scripts` on core KubeJS 1.20.1.
- Suggesting `NativeEvents` on 1.20.1 without confirming the addon or ProbeJS declaration.
- Assuming Forge event class names still exist after a migration to a different loader/version.
- Assuming mutation methods such as `setAmount` or `setDamage` exist without source verification.

The harness must remind agents to check `ForgeEvents`, `NativeEvents`, runtime
version, loader, addons, and ProbeJS declarations before prescribing native
event code.

## Shared Global State Standard

KubeJS `global` / `Global` style state is shared scripting state, not a casual
JavaScript namespace. The MCP must treat it as lifecycle-sensitive evidence.

Required checks:

- Which script scope defines the global key or function.
- Which script scopes read it.
- Whether the value is a function, registry map, mutable list, task table, cache, or debug flag.
- Whether initialization order is stable for the scopes involved.
- Whether reload behavior can leave stale values.
- Whether an existing workspace naming convention exists.

Safe usage:

- Named global functions that bridge event definitions to implementation files.
- Explicit tables initialized in one known scope and consumed by later handlers.
- Debug flags with obvious names and bounded lifetime.
- Compatibility callbacks required by a local addon, when existing scripts or docs prove the callback contract.

Risky usage:

- Hidden mutable arrays/maps appended from multiple scopes.
- Top-level globals initialized from runtime world/server/client state.
- Reusing short generic names such as `global.data`, `global.list`, or `Global.temp`.
- Storing Java objects whose lifetime crosses reloads without a cleanup path.
- Treating `global` as a substitute for clear script/module structure.

Agent answers must identify global ownership. If ownership is unclear, the next
step should be to search existing scripts for the key before changing it.

## Script Style Standard

KubeJS scripts should optimize for lifecycle clarity and reload/debug safety.

Required style:

- Prefer named functions for reusable logic.
- Keep event handlers small and scope-specific.
- Keep registry IDs as explicit strings near their use unless a workspace convention already centralizes them.
- Use comments only to explain lifecycle boundaries, version caveats, or non-obvious registry interactions.
- Avoid hidden global mutation unless the existing workspace clearly uses a shared-state pattern.
- Avoid broad helper abstractions until at least two scripts need the same behavior.

`const`, `let`, and `var` policy:

- Do not create large top-level `const` tables just to look like a normal JS project.
- Use `const` for true local invariants inside a small function or event handler.
- Use `let` only for values that are intentionally reassigned.
- Avoid `var` unless compatibility with an existing script style requires it.
- Avoid top-level computed constants that depend on runtime state unless the KubeJS lifecycle and reload behavior make that safe.

Console/debug policy:

- Do not leave persistent `console.log`, `console.info`, or noisy dumps in committed scripts.
- Debug output must be gated by a named debug flag or removed after diagnosis.
- Prefer KubeJS/Minecraft logging conventions already used by the workspace.
- Error reporting should be actionable and bounded; do not dump entire registries or large recipe lists.

Forbidden generic JS assumptions:

- No Node.js imports unless the workspace already proves they work.
- No browser APIs.
- No package-manager assumptions.
- No bundler/build-step assumptions.
- No ES module export/import style unless the workspace uses it successfully.
- No TypeScript-only syntax in runtime `.js` scripts.

## Recipe Authoring Standard

For recipe work, the MCP must gather:

- Target Minecraft version and loader.
- Existing `server_scripts` recipe patterns.
- ProbeJS recipe snippets.
- Available item/fluid/tag IDs from ProbeJS resources and mod archive data.
- Existing recipes if overriding/removing/modifying.
- Datapack recipe JSON evidence when generated or packed recipes exist.
- Addon evidence when the recipe type is not vanilla.

Required answer behavior:

- Use exact item/fluid/tag IDs from evidence.
- State whether a recipe type is vanilla, KubeJS helper, or addon-provided when evidence exists.
- Show only the minimal event handler needed.
- Avoid generic recipe APIs if the workspace has a stronger existing pattern.
- For removals, identify by output/input/id/type as appropriate and avoid overly broad deletion.

Invalid answer patterns:

- Using guessed IDs.
- Recommending recipe code without checking available snippets or existing scripts.
- Removing recipes with broad predicates that may delete unrelated content.
- Treating tags as items or items as tags.

## Registry Authoring Standard

For registry work, the MCP must inspect:

- `startup_scripts`.
- Existing registry events and naming conventions.
- ProbeJS startup declarations.
- Generated registry resources.
- Resource-pack assets for blocks/items when visual output is required.
- Datapack tags/loot/recipes that should accompany the registry entry.

Registry answers must separate:

- Registration code.
- Asset requirements.
- Tag/loot/recipe integration.
- Client visual requirements.
- Migration/version constraints.

For blocks/items, the answer should not stop at `event.create`. It should state whether blockstates, models, textures, lang, loot, tags, recipes, and client visuals are required or missing.

## Client Script Standard

KubeJS client scripts are client lifecycle scripts, not arbitrary browser UI code.

For client visual tasks, use the client visual evidence standard:

- ProbeJS client declarations.
- `client_scripts` existing patterns.
- Asset evidence.
- Registry IDs.
- Client-only boundaries.
- Renderer/screen/model evidence where available.

The agent must not suggest server-side APIs in `client_scripts` unless the evidence proves they are valid in that scope.

## Datapack And Resource-Pack Standard

KubeJS often generates or consumes datapack/resource-pack content. The MCP must treat this as part of KubeJS authoring, not a separate afterthought.

Required evidence:

- `kubejs/data/**`
- `kubejs/assets/**`
- root or resource-root `data/**`
- root or resource-root `assets/**`
- generated resources
- pack metadata
- mod archive `data/**` and `assets/**`

For datapack-related KubeJS tasks:

- Use datapack version/profile evidence before docs.
- Check data kind: recipes, tags, loot tables, advancements, predicates, damage types, item modifiers, structures, registry, worldgen.
- Avoid writing unsupported datapack formats for the target MC version.

For resource-pack-related KubeJS tasks:

- Check asset kind: blockstates, models, textures, item definitions, lang, atlases, font, particles, sounds.
- Trace references rather than dumping raw JSON.
- Do not return binary assets.

## External Mod Content Standard

When a KubeJS script references modded IDs, the MCP should not waste agent attention searching for source code that may not exist in the workspace.

Evidence priority:

- ProbeJS item/fluid/tag/registry resources.
- Runtime mod JAR data/assets summaries.
- Gradle dependency archives.
- Local `mods/` or `libs/` archives.
- Modrinth/CurseForge/Maven metadata only when local evidence is insufficient and the request asks for it.

The answer should state whether an ID is confirmed locally, inferred from a snippet, or unresolved.

## Crash And Diagnostics Standard

For KubeJS crash or error triage, the MCP should collect:

- `latest.log`, `debug.log`, and crash reports.
- KubeJS error lines and script paths.
- Stack traces and event names.
- ProbeJS diagnostics when script type errors are involved.
- Resource path traces when errors mention missing assets/data.
- Mod archive owner evidence when errors mention classes, mixins, or missing IDs.

The agent must not start by rewriting scripts. It should identify the failing script, event, line, and missing evidence first.

## Performance And Cache Standard

KubeJS modpacks can be large. The MCP must avoid token and CPU waste.

Default behavior:

- Parse ProbeJS summaries once per request or cache key.
- Return matched snippets/resources by query.
- Do not dump full generated declarations.
- Do not return every item in a large modpack unless explicitly requested.
- Use counts and bounded samples.
- Use persistent caches for privacy-safe derived indexes only when configured.
- Keep private/generated caches local and out of repositories.

Allowed expensive mode:

- The user explicitly asks for all items/registries/recipes.
- Crash triage needs full mod archive owner lookup.
- Migration analysis needs cross-version scanning.
- A request asks for a full inventory of a local pack.

Even in expensive mode, output should remain summarized unless the user asks for raw records.

## Migration Standard

KubeJS migration means versioned Minecraft/KubeJS/modding movement, not generic JS migration.

For migration from one MC version to another, the MCP must check:

- Source MC version and target MC version.
- Loader and loader version.
- KubeJS version and addons.
- Script scopes and event names.
- ProbeJS declarations for both available versions when possible.
- Datapack pack format and data kind changes.
- Resource-pack pack format and asset format changes.
- Registry ID changes and removed mods.
- Recipe schema changes.

Migration output should be grouped by:

- Fatal blockers.
- API/event renames.
- Datapack/resource-pack format changes.
- Mod ID/registry changes.
- Script style cleanups.
- Tests or smoke checks to run.

## Agent Answer Standard

A compliant KubeJS answer includes:

- Script scope.
- Evidence used.
- Exact IDs confirmed or unresolved.
- Minimal code or diagnostic guidance.
- Version/loader caveat.
- Debug cleanup note when debug output is used.

A non-compliant answer:

- Treats KubeJS as generic JS.
- Uses guessed API names while ProbeJS exists.
- Leaves persistent console spam.
- Adds broad abstractions without workspace precedent.
- Suggests imports/exports/build tools without evidence.
- Ignores datapack/resource-pack evidence.
- Ignores mod archive evidence for modded IDs.

## MCP Implementation Requirements

Current KubeJS support is stronger than the current client visual route, but it is still not enough as a standard-driven system. Required next slices:

1. Structured KubeJS standards injection instead of one short policy sentence.
2. Queryable ProbeJS item/fluid/tag/registry/recipe cache with counts-first output.
3. KubeJS script lint/evidence pass for lifecycle scope, generic-JS assumptions, and persistent debug output.
4. KubeJS recipe evidence executor that links snippets, existing scripts, and local IDs.
5. KubeJS registry evidence executor that links startup scripts to assets/data requirements.
6. KubeJS migration checklist executor using versioned docs, ProbeJS, datapack, and resource-pack profiles.
7. Crash triage integration that can jump from log line to script, ID, mod archive, or resource file.

The public MCP surface should remain progressive. These should be internal evidence capabilities routed through the existing MCP flow unless a future review proves a small explicit tool is necessary.
