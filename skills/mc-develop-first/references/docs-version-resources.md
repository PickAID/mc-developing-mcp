# Docs, Version Changes, And MDM Resource Playbook

Use for Minecraft version migration, NeoForge/Forge documentation, loader docs, vanilla schema docs, shader docs, mapping/source profiles, and MDM resource packages.

## First Call

```json
{
  "requestText": "Context only: check docs/resource packages for Minecraft task.",
  "operations": [
    {
      "kind": "docs_lookup",
      "docsQuery": "NeoForge migration version changes datapack schema"
    }
  ]
}
```

When a workspace exists:

```json
{
  "requestText": "Context only: use workspace evidence and offline docs recommendations.",
  "workspaceRoot": "/path/to/workspace",
  "operations": [
    {
      "kind": "docs_lookup",
      "docsQuery": "exact docs topic here"
    }
  ],
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
- Put the exact docs topic in `operations[].docsQuery`; do not rely on a broad prose prompt.
- Ask the MCP for version-change docs before proposing code or JSON migration.
- For NeoForge/Forge migrations, distinguish loader version, Minecraft version, and mappings/source evidence.
- For vanilla schemas, ask for schema docs/version profiles before editing pack JSON.

## When Web Search Is Acceptable

Use web search after MCP evidence if:

- The user explicitly asks for latest/current upstream status.
- The MCP reports no package or stale package for the needed docs.
- You need to verify a live external release, issue, or recently changed documentation.

When searching, prefer official/primary sources. Do not let web search override local workspace version evidence without explaining the mismatch.
