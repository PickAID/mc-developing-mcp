# MDM Delivery Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real `mdm-sources` -> release artifact -> MCP resource cache loop while keeping the MCP public surface to one `mc_develop` tool.

**Execution status (2026-04-30):** local delivery-closure loop complete and extended with explicit MDM release install, cached docs resource lookup, and compact docs-resource diagnostics. MCP commits through `18341e5`; `mdm-sources` commits through `ccfe2dc`. Verification is recorded in `docs/reviews/2026-04-30-mdm-delivery-closure-verification.md`, `docs/reviews/2026-04-29-mcp-mdm-release-install-verification.md`, `docs/reviews/2026-04-29-mdm-docs-resource-lookup-verification.md`, and `docs/reviews/2026-04-29-mdm-docs-resource-diagnostics-verification.md`.

**Architecture:** `mdm-sources` owns source manifests, registry files, validation, and release artifact generation. `mc-developing-mcp` owns resource registry reading, artifact cache state, checksum validation, and runtime status injection. The first slice proves the loop with local filesystem artifacts before adding remote GitHub release fetching.

**Tech Stack:** TypeScript monorepo, pnpm, Vitest, Node `fs/promises`, JSON manifests, local tar/zip artifact fixtures, sibling repo `/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources`, existing `@mcpskill/package-registry`, `@mcpskill/runtime-manager`, and `@mcpskill/source-package-manager` patterns.

---

## Repo Roots
- MCP worktree: `/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate`
- Resource repo: `/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources`

## File Structure
**Create in `mdm-sources`:**
- `README.md`
- `.gitignore`
- `schema/package.schema.json`
- `schema/registry.schema.json`
- `packages/core/docs/required/package.json`
- `packages/core/docs/required/payload/core-docs.json`
- `registry/index.json`
- `registry/packages/core-docs-required.json`
- `tools/validate.mjs`
- `tools/build-local-release.mjs`
- `tests/validate.test.mjs`
- `tests/build-local-release.test.mjs`
- `.github/workflows/validate.yml`

**Modify in `mdm-sources`:**
- `index.json`

**Create in MCP repo:**
- `packages/resource-registry/package.json`
- `packages/resource-registry/tsconfig.json`
- `packages/resource-registry/src/index.ts`
- `packages/resource-registry/src/manifest.ts`
- `packages/resource-registry/src/local-registry.ts`
- `packages/resource-registry/src/cache.ts`
- `packages/resource-registry/src/status.ts`
- `packages/resource-registry/src/local-registry.test.ts`
- `packages/resource-registry/src/cache.test.ts`
- `packages/resource-registry/src/status.test.ts`
- `docs/reviews/2026-04-30-mdm-delivery-closure-verification.md`

**Modify in MCP repo:**
- `pnpm-workspace.yaml`
- `package.json`
- `tsconfig.json`
- `packages/shared-types/src/index.ts`
- `packages/shared-types/src/docs.ts`
- `apps/mcp-server/package.json`
- `apps/mcp-server/src/service-profile-context.ts`
- `apps/mcp-server/src/service-profile-context.test.ts`
- `apps/mcp-server/src/mcp-tools.ts`
- `apps/mcp-server/src/mcp-tools.test.ts`
- `tests/monorepo/foundation.test.ts`

## Task 1: Commit `mdm-sources` Baseline
**Files:**
- Create: `../mdm-sources/README.md`
- Create: `../mdm-sources/.gitignore`
- Modify: `../mdm-sources/index.json`

- [ ] **Step 1: Write baseline README**

Create `../mdm-sources/README.md`:

```markdown
# mdm-sources

Structured Minecraft development resource package source repository.

This repository stores package manifests, small legal payloads, generated registry metadata, and release tooling for MCP-consumable `mdm-resources`.

It must not store private user workspace caches, generated ProbeJS dumps from private modpacks, or large vanilla source bundles that require user-side acquisition.

## Layout

- `packages/`: source package definitions and small payloads
- `registry/`: generated registry metadata consumed by MCP
- `schema/`: JSON schemas for package and registry files
- `tools/`: local validation and local release artifact scripts
- `modules/`: legacy module manifests kept for compatibility during migration
```

- [ ] **Step 2: Add `.gitignore`**

Create `../mdm-sources/.gitignore`:

```gitignore
.DS_Store
node_modules/
dist/
.tmp/
release-out/
*.log
```

- [ ] **Step 3: Update legacy index without deleting modules**

Modify `../mdm-sources/index.json` to keep `modules` and add a resource registry pointer:

```json
{
  "schemaVersion": 1,
  "legacyModules": [
    { "name": "core-docs", "path": "modules/core-docs/module.json" },
    { "name": "docs-search", "path": "modules/docs-search/module.json" },
    { "name": "jar-content-index", "path": "modules/jar-content-index/module.json" }
  ],
  "registry": {
    "path": "registry/index.json",
    "format": "mdm-resource-registry-v1"
  }
}
```

- [ ] **Step 4: Commit baseline**

Run:

```bash
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources
git add README.md .gitignore index.json modules
git commit -m "chore: initialize mdm sources baseline"
```

Expected: first commit succeeds and `git status --short` is clean.

## Task 2: Add `mdm-sources` Package Schema And Validation
**Files:**
- Create: `../mdm-sources/schema/package.schema.json`
- Create: `../mdm-sources/schema/registry.schema.json`
- Create: `../mdm-sources/tools/validate.mjs`
- Create: `../mdm-sources/tests/validate.test.mjs`

- [ ] **Step 1: Write failing validation test**

Create `../mdm-sources/tests/validate.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateRepository } from "../tools/validate.mjs";

test("validateRepository accepts a minimal required core docs package", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdm-sources-"));
  await mkdir(join(root, "packages/core/docs/required/payload"), { recursive: true });
  await mkdir(join(root, "registry/packages"), { recursive: true });
  await writeFile(join(root, "packages/core/docs/required/payload/core-docs.json"), "{}\n");
  await writeFile(
    join(root, "packages/core/docs/required/package.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "core-docs-required",
      namespace: "core",
      version: "0.1.0",
      artifactType: "docs",
      variant: "required",
      required: true,
      format: "json",
      payloadRoot: "payload",
      description: "Required core docs package"
    }, null, 2)
  );
  await writeFile(
    join(root, "registry/index.json"),
    JSON.stringify({
      schemaVersion: 1,
      packages: [
        {
          id: "core-docs-required",
          manifestPath: "registry/packages/core-docs-required.json",
          required: true,
          format: "json"
        }
      ]
    }, null, 2)
  );
  await writeFile(
    join(root, "registry/packages/core-docs-required.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "core-docs-required",
      sourcePath: "packages/core/docs/required/package.json",
      currentRelease: null
    }, null, 2)
  );

  const result = await validateRepository(root);

  assert.deepEqual(result.errors, []);
  assert.equal(result.packageCount, 1);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources
node --test tests/validate.test.mjs
```

Expected: fails because `tools/validate.mjs` does not exist.

- [ ] **Step 3: Implement schema and validator**

Create `../mdm-sources/tools/validate.mjs` with exported `validateRepository(root)` that:

- recursively finds `packages/**/package.json`
- checks required fields: `schemaVersion`, `id`, `namespace`, `version`, `artifactType`, `variant`, `required`, `format`, `payloadRoot`, `description`
- verifies `payloadRoot` exists
- verifies `registry/index.json` exists
- verifies every registry package entry has a detail file
- returns `{ packageCount, errors }`

- [ ] **Step 4: Add JSON schema files**

Add `schema/package.schema.json` and `schema/registry.schema.json` matching the fields above. Keep them small and descriptive; validation script can remain custom for now.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
node --test tests/validate.test.mjs
git add schema tools tests
git commit -m "feat: validate mdm resource packages"
```

Expected: validation test passes.

## Task 3: Add First Real Required Resource Package
**Files:**
- Create: `../mdm-sources/packages/core/docs/required/package.json`
- Create: `../mdm-sources/packages/core/docs/required/payload/core-docs.json`
- Create: `../mdm-sources/registry/index.json`
- Create: `../mdm-sources/registry/packages/core-docs-required.json`

- [ ] **Step 1: Add package manifest**

Create package manifest:

```json
{
  "schemaVersion": 1,
  "id": "core-docs-required",
  "namespace": "core",
  "version": "0.1.0",
  "artifactType": "docs",
  "variant": "required",
  "required": true,
  "format": "json",
  "payloadRoot": "payload",
  "description": "Required structured guidance used to explain resource-package state and offline behavior.",
  "capabilities": ["resource-status", "offline-guidance"]
}
```

- [ ] **Step 2: Add payload**

Create `payload/core-docs.json`:

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "offline-resource-status",
      "title": "Offline Resource Status",
      "summary": "The MCP must work without optional resource packages and report missing optional accelerators as degraded capability, not fatal failure."
    },
    {
      "id": "private-derived-cache-policy",
      "title": "Private Derived Cache Policy",
      "summary": "Generated workspace caches, ProbeJS dumps, and user modpack indexes stay in MCP local cache and are not committed to mdm-sources."
    }
  ]
}
```

- [ ] **Step 3: Add registry files**

Create `registry/index.json` and `registry/packages/core-docs-required.json` pointing at the package with `currentRelease: null`.

- [ ] **Step 4: Validate and commit**

Run:

```bash
node --test tests/validate.test.mjs
node tools/validate.mjs
git add packages registry
git commit -m "feat: add required core docs package"
```

Expected: validation reports 1 package and 0 errors.

## Task 4: Build Local Release Artifacts
**Files:**
- Create: `../mdm-sources/tools/build-local-release.mjs`
- Create: `../mdm-sources/tests/build-local-release.test.mjs`

- [ ] **Step 1: Write failing release test**

Create a test that runs `buildLocalRelease({ root, outDir })`, then asserts:

- artifact file exists
- artifact manifest has `sha256`
- registry package detail has non-null `currentRelease`
- registry index package summary includes the same `sha256`

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/build-local-release.test.mjs
```

Expected: fails because `build-local-release.mjs` does not exist.

- [ ] **Step 3: Implement local release builder**

Implement a Node script that:

- reads package manifests
- copies payload files into `release-out/<package-id>/payload`
- writes `release-out/<package-id>/package.json`
- creates a deterministic `.zip` or `.tar` artifact using Node APIs or a documented shell call
- computes sha256
- updates `registry/packages/<id>.json`
- updates `registry/index.json`

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
node --test tests/validate.test.mjs tests/build-local-release.test.mjs
node tools/build-local-release.mjs --out release-out
node tools/validate.mjs
git add tools tests registry
git commit -m "feat: build local mdm resource releases"
```

Expected: tests pass and local release output exists under ignored `release-out/`.

## Task 5: Add MCP Resource Registry Package
**Files:**
- Create: `packages/resource-registry/package.json`
- Create: `packages/resource-registry/tsconfig.json`
- Create: `packages/resource-registry/src/manifest.ts`
- Create: `packages/resource-registry/src/local-registry.ts`
- Create: `packages/resource-registry/src/local-registry.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.json`
- Modify: `tests/monorepo/foundation.test.ts`

- [ ] **Step 1: Write failing local registry test**

Test should create a temp registry with `registry/index.json` and package detail, then call:

```typescript
const registry = await readLocalMdmResourceRegistry(root);
expect(registry.packages[0]).toMatchObject({
  id: "core-docs-required",
  required: true,
  format: "json"
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run packages/resource-registry/src/local-registry.test.ts
```

Expected: fails because package is missing.

- [ ] **Step 3: Implement package**

Implement:

- `MdmResourceRegistry`
- `MdmResourcePackageSummary`
- `MdmResourcePackageDetail`
- `readLocalMdmResourceRegistry(root: string)`
- safe path resolution that rejects escaping paths

- [ ] **Step 4: Wire workspace and run GREEN**

Run:

```bash
pnpm exec vitest run packages/resource-registry/src/local-registry.test.ts tests/monorepo/foundation.test.ts
pnpm exec tsc -b packages/resource-registry --pretty false
```

Expected: tests pass and package builds.

- [ ] **Step 5: Commit**

```bash
git add packages/resource-registry pnpm-workspace.yaml tsconfig.json tests/monorepo/foundation.test.ts
git commit -m "feat(resource-registry): read local mdm registries"
```

## Task 6: Add MCP Resource Cache Status
**Files:**
- Create: `packages/resource-registry/src/cache.ts`
- Create: `packages/resource-registry/src/status.ts`
- Create: `packages/resource-registry/src/cache.test.ts`
- Create: `packages/resource-registry/src/status.test.ts`

- [ ] **Step 1: Write cache/status tests**

Tests must cover:

- missing required package -> `missing_required`
- missing optional package -> `missing_optional`
- present package with matching sha256 -> `ready`
- present package with mismatched sha256 -> `invalid_checksum`

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run packages/resource-registry/src/cache.test.ts packages/resource-registry/src/status.test.ts
```

Expected: fails because cache/status functions are not implemented.

- [ ] **Step 3: Implement minimal cache/status**

Implement:

- `resolveMdmResourceCacheLayout(runtimeRoot)`
- `readCachedResourceState(layout, packageId)`
- `writeCachedResourceState(layout, state)`
- `summarizeMdmResourceStatus({ registry, cacheLayout })`

Do not download remote artifacts in this task.

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
pnpm exec vitest run packages/resource-registry/src/cache.test.ts packages/resource-registry/src/status.test.ts
pnpm exec tsc -b packages/resource-registry --pretty false
git add packages/resource-registry
git commit -m "feat(resource-registry): report resource cache status"
```

## Task 7: Surface Resource Status Through Existing MCP Context
**Files:**
- Modify: `apps/mcp-server/package.json`
- Modify: `apps/mcp-server/src/service-profile-context.ts`
- Modify: `apps/mcp-server/src/service-profile-context.test.ts`
- Modify: `apps/mcp-server/src/mcp-tools.ts`
- Modify: `apps/mcp-server/src/mcp-tools.test.ts`

- [ ] **Step 1: Write failing MCP tests**

Add tests proving:

- when `MDM_SOURCES_ROOT` points at a valid local registry, structured content includes resource status summary
- missing optional packages are summarized without tool failure
- no new public tool appears in `listTools`

- [ ] **Step 2: Run RED**

Run:

```bash
pnpm exec vitest run apps/mcp-server/src/service-profile-context.test.ts apps/mcp-server/src/mcp-tools.test.ts apps/mcp-server/src/mcp-server.test.ts
```

Expected: resource status assertions fail.

- [ ] **Step 3: Implement status injection**

Use existing env/options patterns:

- read `MDM_SOURCES_ROOT` from env
- read registry through `@mcpskill/resource-registry`
- summarize status into service profile/context
- include compact summary in structured content
- do not add a new MCP tool

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
pnpm exec vitest run apps/mcp-server/src/service-profile-context.test.ts apps/mcp-server/src/mcp-tools.test.ts apps/mcp-server/src/mcp-server.test.ts
pnpm --filter @mcpskill/mcp-server test
git add apps/mcp-server
git commit -m "feat(mcp-server): surface mdm resource status"
```

## Task 8: Final Verification And Progress Update
**Files:**
- Create: `docs/reviews/2026-04-30-mdm-delivery-closure-verification.md`
- Modify: `docs/reviews/2026-04-29-project-delivery-progress.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm --filter @mcpskill/mcp-server test
pnpm typecheck
pnpm test
find apps packages tests -path '*/dist' -prune -o -path '*/node_modules' -prune -o -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' \) -print | xargs wc -l | awk '$2 != "total" && $1 > 500 { print }'
find . -path './node_modules' -prune -o -path './apps/*/dist' -prune -o -path './packages/*/dist' -prune -o \( -name '*.go' -o -name 'go.mod' -o -name 'go.sum' \) -print
git diff --check
```

Expected:

- MCP package tests pass
- full test suite passes
- no source/test file over 500 lines
- no Go files
- diff check clean

- [ ] **Step 2: Record real outputs**

Write exact command outputs into `docs/reviews/2026-04-30-mdm-delivery-closure-verification.md`, including:

- `mdm-sources` validation output
- local release artifact listing
- MCP structured resource status sample
- full MCP test counts

- [ ] **Step 3: Update progress document**

Update `docs/reviews/2026-04-29-project-delivery-progress.md`:

- delivery closure status moves from planned to complete
- MCP progress percentage recalculated
- `mdm-sources` progress percentage recalculated
- next phase becomes feature completion to near 100%

- [ ] **Step 4: Commit and push**

Run:

```bash
git add docs/reviews/2026-04-30-mdm-delivery-closure-verification.md docs/reviews/2026-04-29-project-delivery-progress.md
git commit -m "docs: record mdm delivery closure verification"
git push origin skill-update
```

For `mdm-sources`, push its commits only after confirming the remote branch target.

## Plan Self-Review
- Spec coverage: covers `mdm-sources` baseline, release artifact generation, MCP resource registry/cache/status, one-tool public surface, and progress update.
- Placeholder scan: no `TBD`, no unspecified test command, no hidden "write tests later" step.
- Type consistency: uses `MdmResource*` naming consistently for new MCP package and `mdm-resources` as artifact/cache concept.

## Handoff
Recommended execution mode: subagent-driven, with separate workers for:

- `mdm-sources` validation/release tooling
- MCP `resource-registry` package
- MCP structured status integration

Keep each commit small and verified. Do not begin Phase 2 feature completion until this delivery closure plan is complete.
