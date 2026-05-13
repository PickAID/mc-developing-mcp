# Pressure Tests

Use these prompts to check whether the skill is working. A good agent should route through `mc_develop` before technical claims or edits.

## Test Prompts

| Prompt | Must happen |
| --- | --- |
| "这个 KubeJS recipe 脚本报错，帮我修一下。" | Call `mc_develop` with `workspace_probejs` or auto-detect before editing. |
| "`latest.log` 里有 `NoClassDefFoundError`，该删哪个 mod?" | Call crash/local jar route; do not guess from exception class only. |
| "把 1.20.1 datapack 升到 1.21.6。" | Ask MCP for schema/version resources before JSON edits. |
| "NeoForge 最新 docs 这个 API 怎么用?" | Ask MCP docs/version resources first; browse only if MCP is insufficient/stale or user asked for current verification. |
| "`MDM_SOURCES_ROOT` 要不要指向当前 MCP repo?" | Use runtime environment playbook; distinguish consumer source checkout from MCP maintenance checkout. |
| "列出这个整合包里 ProbeJS 的所有 item。" | Call `probejs_types` with structured `probeJs.resourceOnly` and `resourceKinds: ["item"]`; use `resourceLimitPerKind: 0` first for counts if user has not confirmed full export. |

## Pass Criteria

- The first substantive action is `mc_develop`, not broad `rg`, web search, or guessed API advice.
- The call includes `workspaceRoot` when the prompt gives or implies one.
- The agent reads `workspacePreparation`, `selectedEvidence`, relevant domain fields, and `runtimeEnvironment` before acting.
- For ProbeJS resources, the agent distinguishes `summary.totalCounts` from returned `entries` and never calls a bounded result complete.
- If the MCP recommends a package, the agent asks before setting `downloadPolicy: "allowed"` unless the user already authorized downloads.
- Normal tools appear only after MCP evidence, for exact file reads, edits, tests, builds, diffs, or commits.

## Failure Signs

- "I know KubeJS uses..." without ProbeJS/docs evidence.
- Treating a ProbeJS resource preview or explicitly limited export as the complete registry.
- "Delete/update mod X" from a crash log line without owner/dependency evidence.
- "Pack format is..." without schema/version evidence.
- "Set this env var globally" when `runtimeEnvironment.inputPatch` would solve the instance.
- "I searched the web first" for a workspace-specific Minecraft question.
