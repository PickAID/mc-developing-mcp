# Crash Triage Playbook

Use for latest.log, crash reports, missing classes, mixin failures, loader dependency errors, JarJar/nested jars, mod metadata, FTB-related errors, and startup failures.

## Structured First Call

```json
{
  "requestText": "Context only: triage Minecraft crash before suggesting a fix.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "operations": [
    { "kind": "log_files" },
    { "kind": "mod_archive_content", "modArchive": { "inventory": true } }
  ],
  "preparationRoutes": ["local_jar"]
}
```

For broad startup crashes with many mods:

```json
{
  "requestText": "Context only: prewarm local jar indexes and triage startup crash.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "operations": [
    { "kind": "log_files" },
    { "kind": "mod_archive_content", "modArchive": { "inventory": true } }
  ],
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

If the MCP identifies a missing class but no owner, ask for class owner lookup with `modArchive.classOwners`:

```json
{
  "requestText": "Context only: find owner jar for crash class.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "operations": [
    {
      "kind": "mod_archive_content",
      "modArchive": {
        "classOwners": ["com.example.MissingClass"]
      }
    }
  ],
  "preparationRoutes": ["local_jar"],
  "preparationPolicy": {
    "localJarMode": "prewarm_entry_index"
  }
}
```

If the crash is dependency/version-related and local metadata is incomplete, remote metadata may be justified:

```json
{
  "requestText": "Context only: local metadata was insufficient for crash dependency.",
  "workspaceRoot": "/path/to/modpack-or-instance",
  "operations": [
    { "kind": "external_mod_resolution" }
  ],
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
