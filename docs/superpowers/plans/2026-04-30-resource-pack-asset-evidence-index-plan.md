# Resource-Pack Asset Evidence Boundary Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded resource-pack asset evidence support while treating `assets/**` as a first-class domain parallel to datapack `data/**`, without turning MCP into a UI design system.

**Architecture:** Treat resource evidence as core infrastructure. This slice starts with neutral `assets/**` evidence indexing in mod JARs because that is the current lowest-risk path. `@mcpskill/jar-source-adapter` classifies selected asset entries and stores compact metadata in the existing SQLite mod archive entry index. `apps/mcp-server` exposes counts-only summaries through the existing `mc_develop` path. Long nine-slice/grid/dynamic-window guidance remains in resource docs/packages or external Skills.

**Tech Stack:** TypeScript, Node `node:sqlite`, pnpm, Vitest, existing MCP `mc_develop`, existing `jar-source-adapter`, `agent-harness`, and `service-profile` packages.

---

## Focus Contract
- The project remains a Minecraft development evidence system for Java, KubeJS, datapack, resource-pack/assets, Gradle/LSP, mod JARs, ProbeJS, docs/resource packages, and local caches.
- Resource support is not secondary to datapack support; `assets/**` must become a first-class evidence domain with discovery, indexing, summaries, explicit reads, cache invalidation, provenance, and tests.
- Resource-pack UI/design support is allowed only when it improves evidence lookup for real `assets/**` content.
- Do not add new public UI/design MCP tools.
- Do not add runtime prompt tutorials for nine-slice, grid, dynamic-window, taste, or visual design.
- Do not dump PNG binary data, full path lists, or large markdown content by default.
- Keep source and test `.ts`/`.tsx` files under 500 lines.
- Keep Go files and Go module files out of the repo.

## Resource Parity Requirements
- Resource evidence must use the same quality bar as datapack evidence: real file discovery, namespace/kind summaries, explicit reads, provenance, bounded payloads, cache reuse, invalidation, and tests.
- Resource roots must eventually include workspace `assets/`, resource-pack roots, mod JAR `assets/**`, nested JAR assets, and modpack runtime locations where discoverable.
- General resource kinds must not be limited to GUI assets. Later slices must cover models, blockstates, item models, textures, particles, shaders, atlases, fonts, lang files, and pack metadata where relevant.
- Binary entries are indexed as metadata by default. Text/JSON entries can be explicitly read under budget.
- Resource evidence must participate in crash and modpack triage when missing assets, namespace mistakes, broken model references, or client resource failures are plausible.

## File Map
- Create: `packages/jar-source-adapter/src/mod-archive-asset-kind.ts`
- Modify: `packages/jar-source-adapter/src/mod-archive-entry-index.ts`
- Modify: `packages/jar-source-adapter/src/mod-archive-entry-index.test.ts`
- Modify: `apps/mcp-server/src/mod-archive-inventory.ts`
- Modify: `apps/mcp-server/src/mod-archive-persistent-inventory.test.ts`
- Modify: `packages/service-profile/src/profile.test.ts`
- Create: `docs/reviews/2026-04-30-resource-pack-asset-evidence-verification.md`
- Modify: `docs/reviews/2026-04-29-project-delivery-progress.md`

If `packages/jar-source-adapter/src/mod-archive-entry-index.ts` reaches 460 lines during implementation, split helpers before adding more logic:

- Create: `packages/jar-source-adapter/src/mod-archive-entry-index-schema.ts`
- Create: `packages/jar-source-adapter/src/mod-archive-entry-index-summary.ts`

## Task 0: Lock The Boundary Before Coding
- [ ] Run `git status --short --branch`.
- [ ] Confirm there are no implementation files modified before starting this slice.
- [ ] Re-read `docs/superpowers/specs/2026-04-30-resource-pack-ui-boundary-and-evidence-spec.md`.
- [ ] Confirm the implementation slice does not introduce `uiDesign`, `layoutGuidance`, `nineSliceGuidance`, `dynamicWindowGuidance`, or new public MCP tools.

Expected result:

```text
Only planning/docs changes exist before implementation starts.
```

## Task 1: Add Neutral Asset-Kind Classification
**Files:**
- Create: `packages/jar-source-adapter/src/mod-archive-asset-kind.ts`
- Modify: `packages/jar-source-adapter/src/mod-archive-entry-index.test.ts`

- [ ] Add `ModArchiveAssetKind` with these exact values: `gui_texture`, `gui_sprite`, `atlas`, `font`, `lang`.
- [ ] Add `ModArchiveAssetSummary` with `uiAssetCount` and `byKind`.
- [ ] Add `classifyModArchiveAssetKind(relativePath)` using path rules only:

```text
assets/<namespace>/textures/gui/sprites/**/*.png -> gui_sprite
assets/<namespace>/textures/gui/**/*.png -> gui_texture
assets/<namespace>/atlases/**/*.json -> atlas
assets/<namespace>/font/**/*.json -> font
assets/<namespace>/lang/**/*.json -> lang
```

- [ ] Add `parseModArchiveAssetKind(value)` for safe query input parsing.
- [ ] Add a failing test in `mod-archive-entry-index.test.ts` that creates a JAR with one GUI texture, one GUI sprite, one atlas JSON, and one font JSON.
- [ ] The test must request `limit: 0` and assert no entry paths are returned.
- [ ] The test must assert `assetSummary.uiAssetCount === 4`.

Verification:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
```

Expected before implementation: fails because `assetKind`, `assetKinds`, and `assetSummary` do not exist.

## Task 2: Store And Query Asset Evidence In SQLite
**Files:**
- Modify: `packages/jar-source-adapter/src/mod-archive-entry-index.ts`
- Create if needed: `packages/jar-source-adapter/src/mod-archive-entry-index-schema.ts`
- Create if needed: `packages/jar-source-adapter/src/mod-archive-entry-index-summary.ts`

- [ ] Add optional `assetKind` to `ModArchiveIndexedEntry`.
- [ ] Add optional `assetKinds` filter to `queryCachedModArchiveEntries`.
- [ ] Add non-optional `assetSummary` to `QueryCachedModArchiveEntriesResult`.
- [ ] Classify each indexed entry with `classifyModArchiveAssetKind(relativePath)`.
- [ ] Store `asset_kind TEXT NOT NULL DEFAULT ''` in `mod_archive_entry_index_entries`.
- [ ] Bump `CACHE_SCHEMA_VERSION` from `1` to `2`.
- [ ] Use `PRAGMA table_info(mod_archive_entry_index_entries)` to check whether `asset_kind` exists before running `ALTER TABLE`.
- [ ] Do not swallow all SQLite migration errors with a blanket `catch`.
- [ ] Query `assetSummary` with aggregate counts, not by reading all paths into memory.
- [ ] Keep returned entries bounded by the existing `limit`.

Verification:

```bash
wc -l packages/jar-source-adapter/src/mod-archive-entry-index.ts packages/jar-source-adapter/src/mod-archive-asset-kind.ts
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
```

Expected result: each file is under 500 lines and the targeted test passes.

Commit:

```bash
git add packages/jar-source-adapter/src/mod-archive-asset-kind.ts packages/jar-source-adapter/src/mod-archive-entry-index.ts packages/jar-source-adapter/src/mod-archive-entry-index.test.ts
git commit -m "feat(jar-source): classify mod archive asset entries"
```

## Task 3: Expose Counts-Only MCP Inventory Summary
**Files:**
- Modify: `apps/mcp-server/src/mod-archive-inventory.ts`
- Modify: `apps/mcp-server/src/mod-archive-persistent-inventory.test.ts`

- [ ] Add `assetResourceSummary` to inventory payload only when `entryIndex.assetSummary.uiAssetCount > 0`.
- [ ] The payload must include `tokenPolicy: "counts_only"`.
- [ ] The payload must include counts by kind.
- [ ] The payload must not include resource paths by default.
- [ ] Do not use `uiResourceIndex` as a runtime payload field.
- [ ] Do not add a new MCP tool.
- [ ] Add a persistent inventory test that asserts a request about mod archive resource-pack GUI assets returns compact counts and does not contain `textures/gui/widgets.png`.

Verification:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
```

Expected result: targeted tests pass.

Commit:

```bash
git add apps/mcp-server/src/mod-archive-inventory.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts
git commit -m "feat(mcp-server): summarize mod archive asset resources"
```

## Task 4: Guard Runtime Guidance Scope
**Files:**
- Modify: `packages/service-profile/src/profile.test.ts`
- Modify only if a test fails: `packages/service-profile/src/guidance.ts`

- [ ] Add a test that every `profile.guidance` entry is at most 160 characters.
- [ ] Add a test that `profile.guidance` does not contain `nine-slice`, `grid`, or `dynamic-window`.
- [ ] Keep the existing mod archive guidance as evidence-first wording:

```text
Use discovered mod jar data/assets/source content for external mod evidence before assuming it is absent.
```

- [ ] Do not add resource-pack UI methodology to `packages/service-profile/src/guidance.ts`.

Verification:

```bash
pnpm exec vitest run packages/service-profile/src/profile.test.ts
```

Expected result: passes with short evidence-oriented guidance only.

Commit:

```bash
git add packages/service-profile/src/profile.test.ts packages/service-profile/src/guidance.ts
git commit -m "test(service-profile): guard guidance scope"
```

## Task 5: Record Real Verification Output
**Files:**
- Create: `docs/reviews/2026-04-30-resource-pack-asset-evidence-verification.md`

- [ ] Run typecheck.
- [ ] Run the targeted tests from Tasks 2-4.
- [ ] Run a real `tsx` sample that creates a temp workspace, creates a mod JAR with GUI texture/sprite/atlas/font entries, calls `executeMcpServerRequest`, and prints `selectedEvidence.payload.assetResourceSummary`.
- [ ] Paste the real command outputs into the review doc.
- [ ] The sample output must show this shape:

```json
{
  "tokenPolicy": "counts_only",
  "uiAssetCount": 4,
  "byKind": {
    "gui_texture": 1,
    "gui_sprite": 1,
    "atlas": 1,
    "font": 1
  }
}
```

Verification:

```bash
pnpm typecheck
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-entry-index.test.ts apps/mcp-server/src/mod-archive-persistent-inventory.test.ts packages/service-profile/src/profile.test.ts
```

Expected result: all commands pass and the review doc contains actual output, not a hand-written summary only.

Commit:

```bash
git add docs/reviews/2026-04-30-resource-pack-asset-evidence-verification.md
git commit -m "docs: record resource-pack asset evidence verification"
```

## Task 6: Full Guardrails And Progress Update
**Files:**
- Modify: `docs/reviews/2026-04-29-project-delivery-progress.md`

- [ ] Run full tests.
- [ ] Run whitespace diff check.
- [ ] Run line-count guard.
- [ ] Run Go residue guard.
- [ ] Update the progress doc with evidence wording only.

Commands:

```bash
pnpm test
git diff --check
find apps packages tests -path '*/node_modules' -prune -o -path '*/dist' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './.git' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
```

Expected result:

```text
pnpm test passes
git diff --check has no output
line-count guard has no output
Go residue guard has no output
```

Allowed progress wording:

```text
Mod archive asset evidence summary now classifies selected GUI-related asset paths and returns counts-only MCP metadata.
```

Commit:

```bash
git add docs/reviews/2026-04-29-project-delivery-progress.md
git commit -m "docs: record asset evidence progress"
```

## Task 7: Push And Confirm
- [ ] Push to `origin/skill-update`.
- [ ] Confirm local HEAD matches upstream.

Commands:

```bash
git push origin skill-update
git status --short --branch
test "$(git rev-parse HEAD)" = "$(git rev-parse @{u})" && echo "HEAD matches upstream: $(git rev-parse --short HEAD)"
```

Expected result:

```text
## skill-update...origin/skill-update
HEAD matches upstream: <commit>
```

## Deferred Work
- P1 resource parity with datapacks is required follow-up work, not optional polish.
- P1 loose resource/datapack asset classification requires its own small plan.
- P1 workspace `assets/` and resource-pack root discovery requires its own small plan.
- P1 namespace counts and bounded samples require explicit token-budget tests.
- P1 explicit JSON/text reads for general resource kinds require budget and provenance tests.
- P2 PNG header width/height extraction requires a separate spec.
- P2 atlas/font structured summaries require a separate spec.
- Resource-pack UI learning material belongs in resource packages or external Skills, not runtime MCP prompts.

## Acceptance Criteria
- `mc_develop` remains the progressive MCP entry.
- No public UI/design tool is added.
- `assets/**` support remains a first-class evidence requirement equal to datapack `data/**` support.
- Default inventory payload is counts-only.
- Detailed resource reads remain explicit and budgeted.
- Runtime guidance remains evidence-first and short.
- Docs lookup remains fallback for evidence-backed requests.
- Source/test files stay below 500 lines.
- No Go files or Go module files are present.
