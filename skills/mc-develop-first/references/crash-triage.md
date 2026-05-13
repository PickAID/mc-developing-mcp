# Crash Triage Playbook

Use for latest.log, crash reports, missing classes, mixin failures, loader dependency errors, JarJar/nested jars, mod metadata, FTB-related errors, and startup failures.

## First Call

```json
{
  "requestText": "Triage this Minecraft crash. Identify exception signals, likely owner jars/classes/resources, and the next evidence route before suggesting a fix.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "preparationRoutes": ["local_jar"]
}
```

For broad startup crashes with many mods:

```json
{
  "requestText": "Prewarm local jar indexes and triage this startup crash using logs, mod metadata, nested jars, and class/resource owners.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "preparationRoutes": ["local_jar"],
  "preparationPolicy": {
    "localJarMode": "prewarm_entry_index"
  }
}
```

## What To Inspect

- `crashSignals`: exception class, missing class, mixin target, resource path, metadata/dependency hints.
- `selectedEvidence`: log snippets, mod metadata, owner jar, nested JarJar evidence, resource references.
- `workspacePreparation`: whether jar indexing, log discovery, and workspace detection succeeded.
- `resourceActions`: package/docs suggestions if loader/version docs are needed.

## Follow-Up Patterns

If the MCP identifies a missing class or resource but no owner, ask for class/resource owner lookup:

```json
{
  "requestText": "Find the owner jar and nested jar evidence for missing class/resource <name> from the crash.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "preparationRoutes": ["local_jar"],
  "preparationPolicy": {
    "localJarMode": "prewarm_entry_index"
  }
}
```

If the crash is dependency/version-related and local metadata is incomplete, remote metadata may be justified:

```json
{
  "requestText": "Local metadata was insufficient; resolve the likely dependency/version owner for this crash.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "preparationRoutes": ["local_jar", "modrinth", "github"],
  "preparationPolicy": {
    "remoteMetadataPolicy": "enabled"
  }
}
```

## Diagnosis Rules

- Do not stop at the top exception line. Check owner jars, mixins, resource paths, and loader metadata.
- Distinguish cause from symptom. A missing class can be caused by wrong mod version, missing dependency, loader mismatch, or nested jar failure.
- If the MCP says evidence is incomplete, present uncertainty and the exact next route.
- Do not recommend deleting mods or updating random dependencies without evidence.

## Verification

After a fix, ask for or inspect the new log. A successful fix should remove the original crash signal, not merely change the top exception.
