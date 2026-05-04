# Client Visual And KubeJS Standards Verification
Date: 2026-05-05
Author: m1hono

## Result

Added two long-form engineering standards:

- `docs/standards/client-visual-evidence-standard.md`
- `docs/standards/kubejs-authoring-standard.md`

These standards define evidence requirements, invalid answer patterns, tool
priority, performance rules, migration expectations, and future implementation
slices. They are intentionally more rigorous than route-level prompt snippets.

## Important Correction

The current client visual implementation only provides first-pass routing,
resource classification, and prompt guidance. It is not yet a complete evidence
executor. The new standard records the missing requirements explicitly:

- registry-to-asset summaries;
- renderer binding summaries;
- client initialization boundary summaries;
- asset reference graphs;
- connected-resource strategy classification;
- renderer data-sync evidence;
- KubeJS client visual scope integration;
- counts-first structured MCP evidence packets.

KubeJS support is more mature than client visual support because ProbeJS
discovery, d.ts language service, resource summary cache, and snippets/items/
registries extraction already exist. However, its prompt policy was still too
short. The new KubeJS standard records the stricter expected behavior.

## Verification

Documentation-only change. No runtime code changed.

Checks to run before commit:

```sh
git diff --check
run the anonymized-slice leakage guard against the new standards and this review
```
