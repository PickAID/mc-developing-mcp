# MDM Source Profile Recommendation Verification

Date: 2026-05-07
Author: m1hono

## Scope

This verifies that MCP can recommend the public `sources` channel profile added
to `mdm-sources` instead of requiring the agent to guess the package id.

The recommendation remains confirmation-safe: it suggests an
`mdmReleaseInstall` request with `downloadPolicy: "disabled"` and does not
download or generate source content by itself.

## Verified Behavior

For a request like:

```text
Need Minecraft source lookup for ItemStack while migrating mappings.
```

`mc_develop` now returns:

```json
{
  "mdmPackageRecommendations": {
    "suggestions": [
      {
        "packageId": "minecraft-1.20.1-vanilla-source-profile",
        "status": "missing_optional",
        "priority": "high",
        "matchedSignals": ["sources"],
        "mdmReleaseInstall": {
          "packageId": "minecraft-1.20.1-vanilla-source-profile",
          "downloadPolicy": "disabled",
          "manifestPath": "<mdm-sources>/release-out/mdm-release-manifest.json"
        }
      }
    ]
  }
}
```

The resource-registry layer now preserves package selection metadata from local
registry entries:

- `releaseChannel`
- `releaseFamily`
- `capabilities`

That keeps package recommendation logic from depending only on package id text.

## Verification

Commands:

```bash
pnpm --filter @mcpskill/mcp-server test -- core/tools/mcp-tools-mdm-package-recommendations.test.ts
pnpm --filter @mcpskill/resource-registry test -- src/local-registry.test.ts src/status.test.ts
```

Results:

```text
MCP recommendation targeted run: 94 test files passed, 288 tests passed
resource-registry targeted run: 8 test files passed, 31 tests passed
```

## Boundary

This does not install or generate Minecraft source. It only recommends the
public source acquisition profile. Actual source-pack generation still belongs
to MCP runtime-local source acquisition with explicit user confirmation.
