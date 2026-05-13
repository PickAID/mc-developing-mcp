# Docs, Version Changes, And MDM Resource Playbook

Use for Minecraft version migration, NeoForge/Forge documentation, loader docs, vanilla schema docs, shader docs, mapping/source profiles, and MDM resource packages.

## First Call

```json
{
  "requestText": "Check which offline docs, version-change resources, loader docs, schema docs, source indexes, or mapping profiles would help this Minecraft task."
}
```

When a workspace exists:

```json
{
  "requestText": "Use workspace evidence and offline docs recommendations for this Minecraft version/docs task.",
  "workspaceRoot": "/path/to/workspace",
  "preparationRoutes": ["runtime_cache"]
}
```

## Authoritative Sources Covered By MDM

Prefer MDM docs/resource routes for:

- NeoForge primers and migration notes.
- Misode version changelogs and vanilla data/schema changes.
- NeoForge docs/news and versioned docs.
- Forge documentation.
- Curated ChampionAsh5357 primers.
- Shader docs and shader-dev references when the task intersects client visuals/shaders.
- Vanilla datapack/resource-pack schema docs generated from upstream schema sources.

If the MCP cannot supply enough evidence, then use web search or direct upstream sources with explicit attribution.

## Download Policy

The first call must not download resources. Inspect:

- `resourceActions.actions`
- `mdmPackageRecommendations`
- `workspacePreparation.workflow.nextCallPatterns`

Only then call with `downloadPolicy: "allowed"` if the user confirmed or already authorized downloads.

Template:

```json
{
  "requestText": "Install and use the recommended MDM docs package for this task.",
  "mdmReleaseInstall": {
    "manifestUrl": "copy from resourceActions inputPatch",
    "packageId": "copy from resourceActions inputPatch",
    "downloadPolicy": "allowed"
  }
}
```

Do not invent package ids. Copy them from MCP output.

## Version Migration Rules

- Use exact Minecraft/loader versions in the requestText.
- Ask the MCP for version-change docs before proposing code or JSON migration.
- For NeoForge/Forge migrations, distinguish loader version, Minecraft version, and mappings/source evidence.
- For vanilla schemas, ask for schema docs/version profiles before editing pack JSON.

## When Web Search Is Acceptable

Use web search after MCP evidence if:

- The user explicitly asks for latest/current upstream status.
- The MCP reports no package or stale package for the needed docs.
- You need to verify a live external release, issue, or recently changed documentation.

When searching, prefer official/primary sources. Do not let web search override local workspace version evidence without explaining the mismatch.
