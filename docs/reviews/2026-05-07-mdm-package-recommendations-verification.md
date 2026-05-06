# MDM Package Recommendations Verification

Date: 2026-05-07
Author: m1hono

## Scope

This verifies the first MCP-side package selection layer for MDM resources.
The goal is not automatic installation. The goal is to let `mc_develop` tell an
agent which offline package is relevant to the current task, why it matched, and
which confirmation-safe `mdmReleaseInstall` request should be used next.

## Verified Scenario

The test creates a temporary MDM registry with three optional packages:

- `kubejs-1.20.1-guidance`
- `minecraft-1.20.1-vanilla-datapack-profile`
- `client-visual-1.20.1-guidance`

Then it calls `mc_develop` with:

```text
Need KubeJS ForgeEvents and NativeEvents guidance for a datapack recipe task.
```

## Verified Output

The structured output now includes bounded recommendations:

```json
{
  "mdmPackageRecommendations": {
    "policy": "recommend_before_download",
    "suggestions": [
      {
        "packageId": "kubejs-1.20.1-guidance",
        "status": "missing_optional",
        "priority": "high",
        "matchedSignals": ["kubejs"],
        "mdmReleaseInstall": {
          "packageId": "kubejs-1.20.1-guidance",
          "downloadPolicy": "disabled",
          "manifestPath": "<mdm-sources>/release-out/mdm-release-manifest.json"
        }
      },
      {
        "packageId": "minecraft-1.20.1-vanilla-datapack-profile",
        "status": "missing_optional",
        "priority": "medium",
        "matchedSignals": ["datapack"]
      }
    ]
  }
}
```

Important policy behavior:

- Recommendations never download packages by themselves.
- Suggested install hints default to `downloadPolicy: "disabled"` so the next
  call returns a confirmation requirement unless the user explicitly allows it.
- Generic docs terms are not allowed to pull unrelated guidance packages when a
  stronger domain signal exists.
- The selector is conservative and limited to compact structured output.

## Verification

Red check:

```bash
pnpm --filter @mcpskill/mcp-server test -- core/tools/mcp-tools-mdm-package-recommendations.test.ts
```

Result before implementation:

```text
expected structuredContent to match object with mdmPackageRecommendations
```

Green check:

```bash
pnpm --filter @mcpskill/mcp-server test -- core/tools/mcp-tools-mdm-package-recommendations.test.ts
```

Result:

```text
Test Files 94 passed (94)
Tests 287 passed (287)
```

## Boundary

This is a first routing layer. It does not yet install packages automatically,
read datapack/resourcepack profile payloads as evidence, or provide full source
channel selection. The next useful slice is adding public `sources` channel
profiles in `mdm-sources`, then teaching MCP to recommend them for source and
mapping tasks.
