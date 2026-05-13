# Reading mc_develop Results

Use this after every `mc_develop` call. The goal is to turn structured evidence into the next action, not to summarize the whole response.

## Decision Loop

1. Check `workspacePreparation`.
2. Check domain fields: `crashSignals`, `javaDiagnostics`, `kubeJsQuality`, `clientVisualVerifier`.
3. Check `selectedEvidence` and any evidence paths.
4. Check `resourceActions.actions` and `mdmPackageRecommendations`.
5. Choose one next action: follow-up MCP call, file edit, exact file read, test/build, or user confirmation.

## Field Meanings

| Field | How to use it |
| --- | --- |
| `workspacePreparation.routeReadiness` | If degraded/missing, use the suggested route or prerequisite before editing. |
| `workspacePreparation.workflow.nextCallPatterns` | Prefer these exact input patches for follow-up calls. |
| `runtimeEnvironment.inputPatch` | Copy into the next MCP call when roots need to stay stable. |
| `runtimeEnvironment.envPatch` | Use only when a client needs environment-level setup; prefer per-call input first. |
| `selectedEvidence` | Treat this as the citation set for any claim or edit. Read named local files only if needed. |
| `resourceActions.actions` | Package install proposals. They are not consent to download. |
| `mdmPackageRecommendations` | Signals that docs/schema/source/mapping packages may improve evidence. |
| `crashSignals` | Crash triage hints: exception, missing class, mixin, resource path, metadata, owner clues. |
| `javaDiagnostics` | Use for Java edits and compile/LSP diagnosis. |
| `kubeJsQuality` | Use before editing KubeJS. It may identify wrong folders, missing ProbeJS, or script issues. |
| `clientVisualVerifier` | Use for asset/model/rendering/shader proof chains. |

## Next Action Rules

If `nextCallPatterns` exists, call `mc_develop` again unless the result already answers the user.

If a package is recommended, make a no-download discovery call first. Download only after user confirmation or explicit prior authorization.

If local evidence names files, use normal file tools to inspect those exact files. Avoid broad searches unless the evidence points to a file family that the MCP cannot read directly.

If the result reports no workspace, ask for `workspaceRoot` unless the user only asked a general docs question. For general docs, prefer the docs/version resource playbook.

If remote metadata is disabled and local evidence is insufficient, ask for permission or call with:

```json
{
  "preparationPolicy": {
    "remoteMetadataPolicy": "enabled"
  }
}
```

## Reporting Back

For diagnoses, report:

- What evidence was found.
- What is still uncertain.
- What next action is recommended.

For code changes, report:

- Which evidence drove the edit.
- Which files changed.
- Which tests/builds ran.

Never claim a Minecraft API, event, schema, or version behavior is correct unless it came from MCP-selected evidence, a verified local file, or an explicitly cited external source requested by the user.
