# Source Acquisition Production Acceptance Verification

Date: 2026-05-07
Author: m1hono

## Scope

This verification covers high-level `mc_develop` acceptance for production source acquisition behavior.

The important checks are:

- `mc_develop` can execute source acquisition context evidence through the public single-tool path.
- Local mod jars are indexed into the runtime-private SQLite cache.
- Official vanilla source acquisition infers the Minecraft version from request text when workspace metadata is absent.
- Source acquisition remote metadata remains disabled by default.
- The acceptance tests avoid real Modrinth or CurseForge network calls.

## Real Output: Local Jar Index

Request:

```text
Find source for the local mod jar from Modrinth without downloading.
```

The request intentionally mentions Modrinth to exercise the progressive high-level route, but omits loader and Minecraft version so selected `external_mod_resolution` stops at `needs_more_constraints` instead of calling the live API.

Source acquisition context evidence:

```json
{
  "routeStep": "source_acquisition_plan",
  "status": "context",
  "summary": "Planned 3 source acquisition routes.",
  "payload": {
    "source": "source_acquisition_plan",
    "routes": [
      {
        "origin": "runtime_cache",
        "artifactStrategy": "query_cached_packages_and_indexes",
        "cacheMode": "runtime_source_index_cache"
      },
      {
        "origin": "local_jar",
        "artifactStrategy": "index_binary_jar",
        "cacheMode": "runtime_artifact_cache"
      },
      {
        "origin": "modrinth",
        "artifactStrategy": "resolve_remote_jar_metadata",
        "cacheMode": "runtime_metadata_cache"
      }
    ],
    "workItemExecutionStatus": "partial",
    "workItemExecutions": [
      {
        "kind": "jar_index",
        "status": "completed",
        "summary": "Indexed 3 jar entries.",
        "payload": {
          "source": "source_acquisition_jar_index",
          "archiveCount": 1,
          "entryCount": 3,
          "domainCounts": {
            "assets": 1,
            "class": 1,
            "data": 1
          },
          "sampleEntries": [
            {
              "domain": "assets",
              "relativePath": "assets/demo/models/item/gear.json",
              "assetKind": "models"
            },
            {
              "domain": "class",
              "relativePath": "com/example/Gear.class"
            },
            {
              "domain": "data",
              "relativePath": "data/demo/recipe/gear.json",
              "dataKind": "registry"
            }
          ]
        }
      },
      {
        "kind": "remote_metadata",
        "status": "skipped",
        "reason": "handler_unavailable"
      }
    ]
  }
}
```

Selected external evidence remained conservative:

```json
{
  "routeStep": "external_mod_resolution",
  "status": "selected",
  "summary": "External mod resolution needs mod loader, Minecraft version.",
  "payload": {
    "result": {
      "warnings": [
        {
          "code": "needs_more_constraints",
          "message": "Provide mod loader, Minecraft version to resolve API-backed mod candidates and Maven coordinates."
        }
      ]
    }
  }
}
```

## Real Output: Vanilla Confirmation

Request:

```text
Find source for official Minecraft vanilla 1.20.1 from Modrinth context.
```

Source acquisition inferred `1.20.1` from request text and produced confirmation evidence instead of installing or distributing Minecraft source:

```json
{
  "routeStep": "source_acquisition_plan",
  "status": "context",
  "payload": {
    "source": "source_acquisition_plan",
    "workItemExecutionStatus": "partial",
    "workItemExecutions": [
      {
        "kind": "vanilla_generation",
        "status": "completed",
        "summary": "Source package minecraft-1.20.1-source-pack-named requires explicit confirmation before installation.",
        "payload": {
          "source": "source_acquisition_vanilla_generation",
          "result": {
            "status": "needs_confirmation",
            "packageId": "minecraft-1.20.1-source-pack-named",
            "artifactType": "source-pack",
            "confirmationScope": "package-version"
          }
        }
      },
      {
        "kind": "remote_metadata",
        "status": "skipped",
        "reason": "handler_unavailable"
      }
    ]
  }
}
```

Selected external evidence again stopped before live remote resolution:

```json
{
  "routeStep": "external_mod_resolution",
  "status": "selected",
  "summary": "External mod resolution needs mod loader.",
  "payload": {
    "request": {
      "platform": "modrinth",
      "query": "official minecraft vanilla 1",
      "minecraftVersion": "1.20.1"
    },
    "result": {
      "warnings": [
        {
          "code": "needs_more_constraints",
          "message": "Provide mod loader to resolve API-backed mod candidates and Maven coordinates."
        }
      ]
    }
  }
}
```

## Verification

Command:

```bash
pnpm --filter @mcpskill/mcp-server test -- core/tools/mcp-tools-source-acquisition.test.ts core/tools/mcp-tools.test.ts
pnpm test
git diff --check
wc -l apps/mcp-server/src/core/tools/mcp-tools-source-acquisition.test.ts apps/mcp-server/src/source-acquisition/source-acquisition-plan-executor.ts docs/reviews/2026-05-07-source-acquisition-production-acceptance-verification.md
```

Result:

```text
targeted mcp-server: Test Files 91 passed (91), Tests 283 passed (283)
full workspace: Test Files 193 passed (193), Tests 679 passed (679)
git diff --check: passed
```

Line counts:

```text
210 apps/mcp-server/src/core/tools/mcp-tools-source-acquisition.test.ts
116 apps/mcp-server/src/source-acquisition/source-acquisition-plan-executor.ts
215 docs/reviews/2026-05-07-source-acquisition-production-acceptance-verification.md
```

Both files remain below the 500-line source/test file limit.

## Notes

The high-level route still keeps `external_mod_resolution` selected when the request asks about Modrinth. This is intentional for the progressive MCP behavior. The acceptance test avoids live network by leaving remote constraints incomplete, while source acquisition context evidence proves local/private source indexing and vanilla confirmation behavior.
