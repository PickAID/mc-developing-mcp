# External Mod Local Archive Cache Verification

Date: 2026-05-04

## Scope

This slice reuses the existing in-memory `ArchiveContentCache` for MCP local
external mod evidence. `context.query` now passes `modArchiveContentCache` into
`external_mod_resolution`, and local archive inspection uses
`getArchiveInspection` instead of re-reading the same mod jar on repeated
requests.

The change does not add public MCP tools.

## TDD Red

Command:

```bash
pnpm vitest run apps/mcp-server/src/context-query-executor.test.ts -t "reuses mod archive inspection cache"
```

Observed failure before implementation:

```text
× buildMcpServerContextQueryExecutor > reuses mod archive inspection cache for local external mod evidence
  expected local_archive result.cache.archiveInspectionMisses
  received no cache metadata in the external_mod_resolution payload
```

This confirmed that the cache object was not reaching the external mod local
archive path.

## Green And Focused Verification

Commands:

```bash
pnpm typecheck
pnpm vitest run apps/mcp-server/src/context-query-executor.test.ts -t "reuses mod archive inspection cache"
pnpm vitest run apps/mcp-server/src/context-query-executor.test.ts apps/mcp-server/src/external-mod-resolution-local-archives.test.ts apps/mcp-server/src/external-mod-resolution-executor.test.ts apps/mcp-server/src/request-executor-external-mod.test.ts
pnpm vitest run apps/mcp-server/src/mod-archive-content-executor.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts packages/jar-source-adapter/src/archive-content.test.ts packages/jar-source-adapter/src/mod-archive-inventory.test.ts
```

Result:

```text
pnpm typecheck
passed

Focused cache test
Test Files  1 passed (1)
Tests  1 passed | 5 skipped (6)

External mod and context-query group
Test Files  4 passed (4)
Tests  19 passed (19)

Archive cache/inventory group
Test Files  4 passed (4)
Tests  22 passed (22)
```

Full verification:

```text
pnpm test
Test Files  118 passed (118)
Tests  390 passed (390)

git diff --check
passed with no output

TS/TSX 500-line guard
passed with no output

Go residue guard
passed with no output
```

## Actual Return Value

Scenario: temp workspace with `mods/local-energy.jar` containing:

```json
{
  "id": "local_energy",
  "name": "Local Energy",
  "version": "1.0.0"
}
```

Request:

```text
Find the Modrinth mod for Local Energy.
```

First executor call:

```json
{
  "matched": true,
  "summary": "Resolved local mod archive: mods/local-energy.jar.",
  "payload": {
    "source": "external_mod_resolution",
    "result": {
      "source": "local_archive",
      "cache": {
        "archiveInspectionHits": 0,
        "archiveInspectionMisses": 1
      },
      "remoteLookupSkipped": true
    }
  }
}
```

Second executor call with the same `ArchiveContentCache`:

```json
{
  "matched": true,
  "summary": "Resolved local mod archive: mods/local-energy.jar.",
  "payload": {
    "source": "external_mod_resolution",
    "result": {
      "source": "local_archive",
      "cache": {
        "archiveInspectionHits": 1,
        "archiveInspectionMisses": 0
      },
      "remoteLookupSkipped": true
    }
  }
}
```

Cache size after both calls:

```json
{
  "centralDirectories": 0,
  "textFiles": 0,
  "archiveInspections": 1
}
```
