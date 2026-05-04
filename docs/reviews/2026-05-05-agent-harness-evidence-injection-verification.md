# Agent Harness Evidence Injection Verification
Date: 2026-05-05
Author: m1hono
Scope: `packages/agent-harness`, `packages/shared-types`

## Change
`buildHarnessTaskBrief` now injects task-local evidence guidance without adding any public MCP tool.

Returned prompt fragments now include:

```json
{
  "id": "task_evidence_policy",
  "text": "Evidence policy: follow probejs_types -> docs_lookup in order; prefer local Gradle, LSP, ProbeJS, datapack/assets, logs, and JAR evidence before optional docs or remote lookup."
}
```

For KubeJS authoring, returned prompt fragments also include:

```json
{
  "id": "task_kubejs_scripting_policy",
  "text": "KubeJS policy: treat scripts as Minecraft lifecycle scripting, not a generic JS project; use ProbeJS/d.ts evidence and avoid persistent console.* debug output."
}
```

## Verification
Command:

```sh
pnpm exec vitest run packages/agent-harness/src/task-brief.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 2ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  03:57:10
   Duration  244ms (transform 72ms, setup 0ms, collect 80ms, tests 2ms, environment 0ms, prepare 39ms)
```

MCP request assembly command:

```sh
pnpm exec vitest run packages/agent-harness/src/task-brief.test.ts apps/mcp-server/src/request-plan.test.ts apps/mcp-server/src/service-profile-context.test.ts
```

Output:

```text
 RUN  v3.2.4 /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

 ✓ packages/agent-harness/src/task-brief.test.ts (2 tests) 2ms
 ✓ apps/mcp-server/src/request-plan.test.ts (2 tests) 6ms
 ✓ apps/mcp-server/src/service-profile-context.test.ts (1 test) 5ms

 Test Files  3 passed (3)
      Tests  5 passed (5)
   Start at  04:02:37
   Duration  390ms (transform 219ms, setup 0ms, collect 354ms, tests 13ms, environment 0ms, prepare 164ms)
```

Typecheck command:

```sh
pnpm typecheck
```

Output:

```text
> @mcpskill/workspace@ typecheck /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
> tsc -b --pretty false
```

Line check:

```text
     267 packages/shared-types/src/runtime.ts
     107 packages/agent-harness/src/task-brief.ts
     193 packages/agent-harness/src/task-brief.test.ts
     567 total
```

## Notes
- Public MCP surface remains `mc_develop`.
- The guidance is intentionally short and route-driven so it behaves like a small agent harness rather than a separate Skill document.
- KubeJS guidance explicitly avoids generic JavaScript assumptions.
