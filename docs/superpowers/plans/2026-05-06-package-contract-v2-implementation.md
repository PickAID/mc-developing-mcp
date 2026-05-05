# Package Contract v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mature v2 package contract inside `SKillUpdate` so MCP can distinguish public packages, local generated caches, source indexes, docs bundles, datapack/resourcepack bundles, and optional embeddings.

**Architecture:** Add v2 types and validation in `package-registry`, then expose v2 views from existing `resource-registry` and `source-package-manager` without deleting v1 fields yet. Public MCP tools stay minimal; package details remain internal evidence for `mc_develop`.

**Tech Stack:** TypeScript, Node `>=22.5.0`, Vitest, existing packages under `packages/`.

---

## File Structure

- Create `packages/package-registry/src/v2-types.ts`: canonical v2 package manifest facets.
- Create `packages/package-registry/src/v2-validation.ts`: runtime validation and invariants.
- Modify `packages/package-registry/src/index.ts`: export v2 API.
- Test `packages/package-registry/src/v2-validation.test.ts`: accepts valid packages and rejects privacy/capability conflicts.
- Create `packages/resource-registry/src/v2-adapter.ts`: convert v1 resource summaries into v2 manifest views.
- Test `packages/resource-registry/src/v2-adapter.test.ts`: cover JSON docs, SQLite docs, optional accelerator, and generated private cache.
- Create `packages/source-package-manager/src/v2-adapter.ts`: convert source recipes/manifests into v2 views.
- Test `packages/source-package-manager/src/v2-adapter.test.ts`: cover source tree, source index, datapack, resourcepack, ProbeJS, and archive index outputs.

## Contract Rules

- `storageKind` is legacy only. V2 must split format, origin, privacy, lifecycle, and query adapter into separate fields.
- `user_private` packages must set `canCommitToRepository: false` and `canUploadToPublicRelease: false`.
- `public_release` packages must not use `generated_on_demand` as their only lifecycle.
- `query.capabilities` must be a subset of package `capabilities`.
- `embedding_bundle` is optional and must never be the default retrieval path.
- Generated local packages must point back to an authoritative source package, workspace path, jar path, or recipe step.

## Task 1: Add v2 Types

**Files:**
- Create: `packages/package-registry/src/v2-types.ts`
- Modify: `packages/package-registry/src/index.ts`

- [ ] Write `PackageIdentityV2`, `PackageTargetV2`, `ArtifactContractV2`, `PackagePolicyV2`, `QueryContractV2`, and `PackageManifestV2`.
- [ ] Include artifact kinds: `docs_bundle`, `source_tree`, `source_index`, `datapack_bundle`, `resourcepack_bundle`, `probejs_snapshot`, `mod_archive_index`, `embedding_bundle`.
- [ ] Include query adapters: `json_docs`, `sqlite_docs`, `source_index_sqlite`, `source_tree`, `archive_content`, `embedding_index`.
- [ ] Export the new types from `packages/package-registry/src/index.ts`.
- [ ] Run `pnpm --filter @mcpskill/package-registry build`.
- [ ] Commit `feat(package-registry): add v2 package contract types`.

## Task 2: Add v2 Validation

**Files:**
- Create: `packages/package-registry/src/v2-validation.ts`
- Create: `packages/package-registry/src/v2-validation.test.ts`
- Modify: `packages/package-registry/src/index.ts`

- [ ] Write tests for a valid public SQLite docs package.
- [ ] Write tests rejecting `user_private` packages that are uploadable or committable.
- [ ] Write tests rejecting `query.capabilities` values not declared in root `capabilities`.
- [ ] Write tests rejecting `defaultLimit > maxLimit`.
- [ ] Implement `parsePackageManifestV2(input: unknown): PackageManifestV2`.
- [ ] Implement explicit error messages suitable for agent-facing diagnostics.
- [ ] Run `pnpm exec vitest run --root . packages/package-registry/src/v2-validation.test.ts`.
- [ ] Run `pnpm --filter @mcpskill/package-registry build`.
- [ ] Commit `feat(package-registry): validate v2 package manifests`.

## Task 3: Adapt resource-registry

**Files:**
- Create: `packages/resource-registry/src/v2-adapter.ts`
- Create: `packages/resource-registry/src/v2-adapter.test.ts`
- Modify: `packages/resource-registry/src/index.ts`

- [ ] Convert v1 docs JSON resources into `docs_bundle` plus `json_docs`.
- [ ] Convert v1 SQLite resources into `docs_bundle` plus `sqlite_docs`.
- [ ] Convert v1 optional accelerator resources into public downloadable packages with non-required lifecycle.
- [ ] Convert generated local caches into `user_private`, `generated_on_demand`, `evictable`, non-commit, non-upload packages.
- [ ] Validate each produced v2 manifest with `parsePackageManifestV2`.
- [ ] Run `pnpm exec vitest run --root . packages/resource-registry/src/v2-adapter.test.ts`.
- [ ] Run `pnpm --filter @mcpskill/resource-registry build`.
- [ ] Commit `feat(resource-registry): expose v2 package views`.

## Task 4: Adapt source-package-manager

**Files:**
- Create: `packages/source-package-manager/src/v2-adapter.ts`
- Create: `packages/source-package-manager/src/v2-adapter.test.ts`
- Modify: `packages/source-package-manager/src/index.ts`

- [ ] Map source tree outputs to `source_tree` plus `source_tree` query adapter.
- [ ] Map SQLite source indexes to `source_index` plus `source_index_sqlite`.
- [ ] Map extracted jar/datapack/resourcepack content to `mod_archive_index`, `datapack_bundle`, or `resourcepack_bundle`.
- [ ] Map ProbeJS outputs to `probejs_snapshot`, `user_private` unless explicitly curated public docs.
- [ ] Preserve recipe provenance so generated caches are traceable.
- [ ] Run `pnpm exec vitest run --root . packages/source-package-manager/src/v2-adapter.test.ts`.
- [ ] Run `pnpm --filter @mcpskill/source-package-manager build`.
- [ ] Commit `feat(source-package-manager): expose v2 package views`.

## Final Verification

- [ ] Run `pnpm test`.
- [ ] Run `pnpm run publish:check`.
- [ ] Run `pnpm run publish:dry-run`.
- [ ] Run `pnpm run publish:install-smoke`.
- [ ] Run `pnpm run publish:release-check`; expected to fail while package versions remain `0.0.0`.

## Acceptance Criteria

- MCP can explain package selection using declared v2 capabilities.
- Public packages and private generated caches are impossible to confuse in code.
- Existing v1 registries keep working during migration.
- No new public MCP tool explosion is introduced.
