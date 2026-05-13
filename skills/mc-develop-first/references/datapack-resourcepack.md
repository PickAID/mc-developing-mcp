# Datapack And Resource Pack Playbook

Use for datapack JSON, resource-pack assets, models, blockstates, item models, loot tables, recipes, tags, predicates, advancements, worldgen, FTB quests data, client visuals, and vanilla schema/version migration.

## First Call

```json
{
  "requestText": "Inspect datapack/resource-pack evidence, pack roots, version profile, resource locations, and schema/docs before editing this content.",
  "workspaceRoot": "/path/to/pack-or-modpack"
}
```

If you know the task is data-only:

```json
{
  "requestText": "Check datapack roots, resource locations, version profile, and vanilla schema evidence for this data edit.",
  "workspaceRoot": "/path/to/pack-or-modpack",
  "preparationRoutes": ["runtime_cache"]
}
```

If assets/models/client visuals are involved:

```json
{
  "requestText": "Trace resource-pack asset/model references and client visual evidence before editing.",
  "workspaceRoot": "/path/to/pack-or-modpack"
}
```

## What To Inspect

- `workspacePreparation`: pack roots, detected workspace, missing package suggestions.
- `selectedEvidence`: pack files, resource references, version profiles, schema records.
- `clientVisualVerifier`: asset/model/rendering/shader proof-chain status.
- `mdmPackageRecommendations`: vanilla datapack/resource-pack profiles and schema docs.
- `resourceActions`: install proposals for vanilla schema docs or version profiles.

## Version And Schema Rules

- Do not assume `pack_format`, worldgen shape, item model format, recipe fields, or tag behavior is stable across versions.
- If vanilla schema docs or version profiles are recommended, follow `docs-version-resources.md` before editing.
- Verify resource locations: namespace, path, extension, and pack root all matter.
- Keep data and assets in the correct root. A valid JSON file in the wrong root is still wrong.

## Follow-Up For Missing Schema/Profile

```json
{
  "requestText": "Find or install the relevant vanilla schema docs/version profile for this datapack/resource-pack edit.",
  "workspaceRoot": "/path/to/pack-or-modpack",
  "preparationRoutes": ["runtime_cache"]
}
```

If `resourceActions.actions` proposes a package, ask before using `downloadPolicy: "allowed"` unless the user already authorized downloads.

## Verification

Use structured validation if the project provides it. If not, run a Minecraft/datapack load check only when available, and report when validation is limited to schema/evidence inspection.
