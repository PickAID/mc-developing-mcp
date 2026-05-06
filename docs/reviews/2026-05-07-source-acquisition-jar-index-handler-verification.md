# Source Acquisition Jar Index Handler Verification

Date: 2026-05-07
Author: m1hono

## Scope

This slice adds MCP-side `jar_index` handling for source acquisition work items.

The handler indexes an arbitrary user/local jar into a runtime-private SQLite archive entry cache. It does not write into the workspace, does not write into the repository, and does not distribute jar contents.

## Implementation Boundary

The existing jar adapter scans jars from workspace-like roots. To support arbitrary user jar paths without changing the near-500-line adapter file, the MCP handler creates a runtime-only staging workspace:

```text
<runtimeRoot>/source-acquisition/jar-workspaces/<sha256(sourceArchive)>/mods/<basename>.jar
```

It uses a hardlink when possible and falls back to copying only when the filesystem cannot hardlink across devices. The SQLite index is stored at:

```text
<runtimeRoot>/source-acquisition/jar-entry-index.sqlite
```

## Real Output

For a jar containing:

```text
data/demo/recipe/gear.json
assets/demo/models/item/gear.json
com/example/Gear.class
```

The first run returns:

```json
{
  "source": "source_acquisition_jar_index",
  "archiveCount": 1,
  "entryCount": 3,
  "cache": {
    "archiveHits": 0,
    "archiveMisses": 1
  },
  "domainCounts": {
    "assets": 1,
    "class": 1,
    "data": 1
  }
}
```

The second run returns a cache hit:

```json
{
  "cache": {
    "archiveHits": 1,
    "archiveMisses": 0
  }
}
```

## Verification

Commands:

```bash
pnpm --filter @mcpskill/mcp-server test -- source-acquisition/source-acquisition-work-item-handlers.test.ts
pnpm test
git diff --check
wc -l apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.ts apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.test.ts
```

Results:

```text
mcp-server targeted: Test Files 90 passed (90), Tests 278 passed (278)
full workspace: Test Files 192 passed (192), Tests 674 passed (674)
```

Line counts:

```text
252 apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.ts
282 apps/mcp-server/src/source-acquisition/source-acquisition-work-item-handlers.test.ts
```

Both files remain below the 500-line limit.

## Remaining Work

The next source acquisition handler should cover `vanilla_generation` through the existing source package confirmation and vanilla package generation flow.
