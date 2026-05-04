# KubeJS Native Events And Global Harness Verification
Date: 2026-05-05
Author: m1hono

## Result

The harness KubeJS policy now explicitly tells agents to verify
`ForgeEvents`, `NativeEvents`, and `global` / `Global` usage against runtime,
addons, ProbeJS/d.ts evidence, and existing scripts.

Runtime prompt changes:

- Default KubeJS brief now warns that core KubeJS 1.20.1 `ForgeEvents` is
  `startup_scripts` only.
- Default KubeJS brief now warns that `NativeEvents` requires a native-event
  addon on 1.20.1 or core KubeJS 1.21.1+.
- Default KubeJS brief now treats `global` / `Global` as shared KubeJS state
  that needs ownership, named keys/functions, and lifecycle boundaries.
- Task-level KubeJS policy now includes the same native-event/global evidence
  requirement in compact form.

## MCP Evidence Used

Evidence was gathered with the current Minecraft MCP:

- `search_docs("KubeJS ForgeEvents NativeEvents Global global 1.20.1")`
- `read_doc(8890)` for the KubeJS API surface reference.
- `smart_search("ForgeEvents NativeEvents onEvent global bindings", 1.20.1, kubejs)`
- `smart_search("NativeEvents Global global bindings onEvent", 1.21.1, kubejs)`
- `smart_search("BuiltinKubeJSForgePlugin ForgeEvents bindings startup", 1.20.1, kubejs)`
- `smart_search("Global binding BindingRegistry global object bindings", 1.21.1, kubejs)`

Verified source/doc facts:

- `BuiltinKubeJSForgePlugin.registerBindings` adds `ForgeEvents`,
  `ForgeModEvents`, and legacy `onForgeEvent` only when the script type is
  startup.
- `ForgeEventWrapper.onEvent` registers raw Forge event consumers and warns
  that reload requires restart after first load.
- KubeJS 1.21.1 has `NativeEventWrapper`, which registers native event
  listeners by script type and chooses the mod bus for mod-bus events.
- Mod-provided bindings are added through `ModResourceBindings` and filtered by
  script type.
- The KubeJS API surface reference records the version/addon split for
  `ForgeEvents` and `NativeEvents`.

## Verification

Commands passed:

```sh
pnpm --filter @mcpskill/agent-harness test
pnpm typecheck
pnpm test
git diff --check
```

Latest full verification: `pnpm test` passed with 146 test files and 471 tests.

## Notes

`packages/agent-harness/src/policy.test.ts` already had formatting-only local
changes before this slice. This slice did not rely on that file and it should
not be included in the commit unless intentionally normalized later.
