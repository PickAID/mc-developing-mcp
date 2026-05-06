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

## Stdio Acceptance

The same producer-to-consumer contract is now verified through the real stdio
MCP subprocess, not only the in-process handler.

The stdio test:

1. Builds `dist/stdio.js` through the package test command.
2. Starts the MCP server with `StdioClientTransport`.
3. Provides `MDM_SOURCES_ROOT`, `MCPSKILL_RUNTIME_ROOT`, and
   `MCPSKILL_WORKSPACE_ROOT` through process environment.
4. Calls `mc_develop` through JSON-RPC with the real generated release manifest.
5. Verifies SQLite docs lookup returns `mdm.sqlite-index-role`.

Command:

```bash
pnpm --filter @mcpskill/mcp-server test -- core/server/stdio-subprocess.test.ts core/tools/mcp-tools-mdm-real-release.test.ts
```

Result:

```text
Test Files 92 passed (92)
Tests 285 passed (285)
stdio real release case: passed in about 0.8s
```

## Remote URL Acceptance

The remote release URL path is now covered without live network dependency. The
test still uses the real sibling `mdm-sources` producer and real generated
SQLite bytes, but injects fetchers with a GitHub Release shaped URL:

```text
https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.1.0/mdm-release-manifest.json
https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.1.0/core-docs-search-sqlite-0.1.0.sqlite
```

Verified behavior:

- `mc_develop` fetches the manifest from the provided remote `manifestUrl`.
- The artifact URL is resolved as a sibling of that manifest URL.
- The real SQLite artifact bytes are checksum-verified and cached only with
  `downloadPolicy: "allowed"`.
- The same `mc_develop` call can search the installed SQLite docs package and
  return `mdm.sqlite-index-role` with `source: "sqlite"`.

Command:

```bash
pnpm --filter @mcpskill/mcp-server test -- core/tools/mcp-tools-mdm-remote-release.test.ts core/tools/mcp-tools-mdm-real-release.test.ts
```

Result:

```text
Test Files 93 passed (93)
Tests 286 passed (286)
remote release case: passed in about 0.5s
```

Boundary: this proves remote URL acceptance and artifact URL resolution for one
real producer artifact. It does not yet prove a live published GitHub Release,
all release channels, full corpus coverage, signing/provenance, or retention
policy.
