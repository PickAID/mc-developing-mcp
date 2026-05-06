# Real MDM Release Consumption Verification

Date: 2026-05-07
Author: m1hono

## Scope

This verifies that MCP can consume a real `mdm-sources` producer release instead
of a synthetic test manifest.

The test path:

1. Finds the sibling `mdm-sources` repository.
2. Copies it to a temporary directory.
3. Runs the real release builder:

```bash
node tools/build-local-release.mjs --out <temp>/release-out --channel docs
```

4. Starts the real high-level `mc_develop` handler with `MDM_SOURCES_ROOT`
   pointing at the copied producer repository.
5. Calls `mc_develop` with:

```json
{
  "requestText": "Find sqlite index role docs for offline MDM package queries.",
  "mdmReleaseInstall": {
    "manifestPath": "<temp>/release-out/mdm-release-manifest.json",
    "packageId": "core-docs-search-sqlite",
    "downloadPolicy": "allowed"
  }
}
```

## Verified Output

The high-level MCP result installs the real producer artifact:

```json
{
  "mdmReleaseInstall": {
    "status": "downloaded",
    "packageId": "core-docs-search-sqlite",
    "downloadPolicy": "allowed"
  }
}
```

The same call then refreshes MDM resource status and uses the installed SQLite
artifact during docs lookup:

```json
{
  "selectedEvidence": {
    "routeStep": "docs_lookup",
    "payload": {
      "hits": [
        {
          "entryId": "mdm.sqlite-index-role",
          "packageId": "core-docs-search-sqlite",
          "source": "sqlite"
        }
      ],
      "trace": {
        "sqliteArtifactPackageIds": ["core-docs-search-sqlite"],
        "sqliteMatchedEntryIds": ["mdm.sqlite-index-role"]
      }
    }
  }
}
```

## Verification

Command:

```bash
pnpm --filter @mcpskill/mcp-server test -- core/tools/mcp-tools-mdm-real-release.test.ts core/tools/mcp-tools-mdm-sqlite-resources.test.ts
```

Result:

```text
Test Files 92 passed (92)
Tests 284 passed (284)
```

The targeted real release test passed:

```text
mc_develop real mdm-sources release consumption > installs and searches a real mdm-sources SQLite docs release artifact
```

## Boundary

This still uses a local filesystem release manifest, not a published GitHub
Release URL. It proves the producer-to-consumer contract: real `mdm-sources`
builder output can be installed and queried by `mc_develop`.
