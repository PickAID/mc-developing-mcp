# MDM SQLite Docs End-To-End Verification

Date: 2026-05-06

## Scope

This verifies the chain from a release manifest SQLite docs artifact to MCP docs lookup evidence.

## Verified Chain

- A real SQLite artifact is created with `docs_entries` and `docs_entries_fts`.
- `mdmReleaseInstall` installs the artifact into the runtime resource cache.
- `mdmResources.summary.counts.ready` reports the SQLite package as ready.
- `loadMdmDocsResourcesFromStatus` exposes the ready package as a SQLite docs artifact.
- `docs_lookup` searches the SQLite database and returns a hit with `source: "sqlite"`.

## Command

```bash
pnpm --filter @mcpskill/mcp-server test -- core/tools/mcp-tools-mdm-sqlite-resources.test.ts
```

## Result

The command passed.

Observed summary:

```text
Test Files  86 passed (86)
Tests       270 passed (270)
```

The targeted SQLite file `apps/mcp-server/src/core/tools/mcp-tools-mdm-sqlite-resources.test.ts` passed 1 test:

```text
installs sqlite docs resources and uses them during docs lookup
```

The SQLite docs lookup assertion verified:

```json
{
  "entryId": "mdm.sqlite-index-role",
  "packageId": "core-docs-search-sqlite",
  "source": "sqlite"
}
```

The selected evidence trace also contained:

```json
{
  "sqliteArtifactPackageIds": ["core-docs-search-sqlite"],
  "sqliteMatchedEntryIds": ["mdm.sqlite-index-role"]
}
```

## Full Workspace Verification

```bash
pnpm test
```

Result:

```text
Test Files  185 passed (185)
Tests       656 passed (656)
```

## Boundary

This is a public docs/search SQLite path. It does not distribute Minecraft source, remapped Java source, private ProbeJS output, private modpack indexes, or embeddings over user content. Those remain local-generated package/cache artifacts.
