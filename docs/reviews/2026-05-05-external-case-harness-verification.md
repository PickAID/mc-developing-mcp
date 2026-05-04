# External Case Harness Verification

Date: 2026-05-05

Scope:
- Strengthen agent harness and workspace detection for external-case-inspired mod workspaces.
- Do not modify resource/datapack adapters or Gradle/JAR adapters.
- Keep public MCP surface unchanged.

External cases read:
- `/Users/gedwen/Documents/programing/MC/_external/jei-research/JustEnoughItems/settings.gradle.kts`
- `/Users/gedwen/Documents/programing/MC/_external/L2Weaponry/libs`

Observed patterns:
- JEI uses a multi-loader, multi-module Gradle layout with `Common`, `Fabric`, `NeoForge`, API, library, and GUI subprojects.
- L2 workspaces keep many local dependency jars under `libs`, including paired `*-sources.jar` files and runtime jars.

Changes verified:
- Workspace detection now scans root `libs/*.jar` as local mod archive evidence, while continuing to ignore `*-sources.jar`.
- Default Java mod routing with local jars now returns local evidence before docs:

```json
{
  "intent": {
    "id": "workspace_default",
    "confidence": "low",
    "reasons": ["request text does not match a specialized harness intent"]
  },
  "taskRoute": {
    "reasons": [
      "fall back to the default workspace route when no specialized intent is detected"
    ],
    "steps": ["workspace_source", "mod_archive_content", "docs_lookup"],
    "preferredTools": ["source.bundle", "context.query", "workspace.analyze"]
  },
  "preferredTools": ["source.bundle", "context.query", "workspace.analyze"]
}
```

Tests run:
- `pnpm --filter @mcpskill/workspace-detector test`
- `pnpm --filter @mcpskill/agent-harness test`
- `pnpm --filter @mcpskill/workspace-detector build`
- `pnpm --filter @mcpskill/agent-harness build`

Line guard:
- `wc -l packages/agent-harness/src/*.ts packages/workspace-detector/src/*.ts apps/agent-runtime/src/*.ts`
- Largest touched TypeScript file after change: `packages/agent-harness/src/task-route.test.ts` at 417 lines.

Risk notes:
- `libs` jars are now treated as local mod archive evidence for routing. This is intentional for libs-heavy mod workspaces, but non-mod Java projects with root `libs/*.jar` may also receive local jar evidence before docs if they are detected as Java mod workspaces.
- No public exports or MCP tool surfaces were changed.
