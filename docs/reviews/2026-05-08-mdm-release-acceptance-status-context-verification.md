# MDM Release Acceptance Status Context Verification

Date: 2026-05-08
Author: m1hono

## Scope

Expose local `mdm-sources` release acceptance state through existing
`mc_develop` structured `mdmResources` context without adding public tools or
changing the `mc_develop` input schema.

## Result

- `buildMdmResourceStatusContext()` now reads
  `release-out/mdm-release-acceptance-report.json` when `MDM_SOURCES_ROOT` is
  configured.
- Missing acceptance reports are non-fatal and produce no extra field.
- Invalid report JSON or shape produces compact `{ status: "invalid", error }`
  instead of making the registry unavailable.
- Valid reports expose only bounded summary fields: status, generated time,
  package/artifact counts, total bytes, repository/schema error counts, and
  install verifier counts.
- `formatMdmResourceStatusPrompt()` now includes one compact release acceptance
  line for agent guidance.
- `mc_develop` structured content includes the same compact
  `mdmResources.releaseAcceptance` payload.

## Verification

```text
pnpm exec vitest run apps/mcp-server/src/docs/mdm-resource/mdm-resource-status.test.ts apps/mcp-server/src/core/tools/mcp-tools-mdm-resources.test.ts

Test Files  2 passed (2)
Tests  10 passed (10)
```

```text
pnpm exec vitest run apps/mcp-server/src/docs/mdm-resource/mdm-resource-status.test.ts apps/mcp-server/src/core/tools/mcp-tools-mdm-resources.test.ts apps/mcp-server/src/core/tools/mcp-tools-mdm-real-release.test.ts apps/mcp-server/src/core/tools/mcp-tools-mdm-remote-release.test.ts

Test Files  4 passed (4)
Tests  12 passed (12)
```

```text
pnpm --filter @mcpskill/mcp-server exec tsc -b

exit 0
```

## Acceptance Fixture

The test fixture mirrors the current local `mdm-sources` acceptance report:

```text
status passed
packageCount 465
artifactCount 467
totalSizeBytes 2732077
repositoryErrorCount 0
schemaErrorCount 0
installVerifiedCount 465
installPackageCount 465
```

## Boundaries

- No new public MCP tool.
- No remote fetch.
- No release publication.
- No change to `@mcpskill/resource-registry` registry contract.
- No distribution of generated Minecraft source or private caches.
