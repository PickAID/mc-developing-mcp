# Reference MCP Absorption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first production slices from the reference MCP absorption roadmap: chunked source search, match reasons, line-range follow-up, package/cache metadata, and verifier-ready evidence.

**Architecture:** Keep `mc_develop` as the only progressive public surface. Add focused internal packages/helpers and extend existing executors so agents receive compact structured evidence rather than many new tools.

**Tech Stack:** TypeScript, Vitest, SQLite/FTS5 via existing `@mcpskill/source-index`, existing MCP server executors, existing source-package/resource-registry packages.

---

## File Structure

- Modify `packages/source-index/src/schema.ts`: add schema version metadata, `source_chunks`, and `fts_chunks`.
- Modify `packages/source-index/src/types.ts`: add chunk query/read result types and `matchReasons`.
- Modify `packages/source-index/src/indexer.ts`: build chunks, query chunks, and keep existing APIs compatible.
- Modify `packages/source-index/src/indexer.test.ts`: cover chunk search, FTS fallback, and line-range follow-up.
- Create `packages/source-index/src/chunks.ts`: chunk source files into bounded line ranges.
- Create `packages/source-index/src/query-ranking.ts`: normalize query text and produce match reasons.
- Modify `packages/docs-retrieval/src/search.ts`: add `matchReasons` and a chunk-like hit shape for docs records.
- Modify `packages/docs-retrieval/src/search.test.ts`: verify docs search explains matches.
- Create `packages/jar-source-adapter/src/mod-archive-analysis.ts`: summarize mixin configs, access wideners, entrypoints, dependencies, services, and class/resource counts.
- Create `packages/jar-source-adapter/src/mod-archive-analysis.test.ts`: fixture-backed archive analysis tests.
- Modify `apps/mcp-server/src/mod-archive-content-executor.ts`: include compact pre-decompile analysis when request context needs mod archive evidence.
- Create `packages/source-package-manager/src/source-job-state.ts`: internal remap/decompile/acquisition job state contract.
- Create `packages/source-package-manager/src/source-job-state.test.ts`: validate state transitions and lock keys.
- Create `apps/mcp-server/src/mixin-target-verifier.ts`: verifier-ready target result shape, initially backed by source index/class owner evidence.
- Create `apps/mcp-server/src/mixin-target-verifier.test.ts`: validate missing/valid/ambiguous target statuses.
- Modify docs after implementation: `docs/specs/reference-mcp-architecture-absorption-backlog.md` and `docs/reviews/2026-05-05-reference-mcp-absorption-verification.md`.

## Task 1: Source Index Chunk Schema

**Files:**
- Create: `packages/source-index/src/chunks.ts`
- Modify: `packages/source-index/src/schema.ts`
- Modify: `packages/source-index/src/types.ts`
- Modify: `packages/source-index/src/indexer.ts`
- Test: `packages/source-index/src/indexer.test.ts`

- [ ] **Step 1: Write the failing chunk schema test**

Add this test to `packages/source-index/src/indexer.test.ts`:

```ts
it("indexes bounded chunks with line ranges and match reasons", async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-chunks-"));
  const javaPath = join(sourceRoot, "demo", "ScreenRenderer.java");
  const databasePath = join(sourceRoot, "source-index.sqlite");

  await mkdir(join(javaPath, ".."), { recursive: true });
  await writeFile(
    javaPath,
    [
      "package demo;",
      "public class ScreenRenderer {",
      "  void render() {",
      "    RenderSystem.enableBlend();",
      "    GuiGraphics graphics;",
      "  }",
      "}"
    ].join("\n")
  );

  await buildSourceIndex({
    sourceRoot,
    databasePath,
    packageId: "demo-source-pack"
  });

  expect(
    querySourceIndex({
      databasePath,
      text: "RenderSystem enableBlend",
      limit: 5
    }).matches
  ).toEqual([
    expect.objectContaining({
      path: "demo/ScreenRenderer.java",
      startLine: expect.any(Number),
      endLine: expect.any(Number),
      matchReasons: expect.arrayContaining(["fts_chunk", "term:RenderSystem"])
    })
  ]);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm exec vitest run packages/source-index/src/indexer.test.ts
```

Expected: fail because `SourceIndexMatch` does not include `startLine`, `endLine`, or `matchReasons`.

- [ ] **Step 3: Add chunk types**

Update `packages/source-index/src/types.ts`:

```ts
export interface SourceIndexMatch {
  path: string;
  kind: SourceIndexedFileKind;
  sizeBytes: number;
  sha256: string;
  packageId?: string;
  packageName?: string;
  simpleName?: string;
  qualifiedName?: string;
  startLine?: number;
  endLine?: number;
  chunkId?: string;
  matchReasons?: string[];
}
```

- [ ] **Step 4: Add `chunks.ts`**

Create `packages/source-index/src/chunks.ts`:

```ts
export interface SourceTextChunk {
  chunkId: string;
  chunkType: "file_head" | "code_window";
  startLine: number;
  endLine: number;
  content: string;
  tokenCount: number;
}

const DEFAULT_MAX_LINES = 40;

export function chunkSourceText(
  content: string,
  options: { maxLines?: number } = {}
): SourceTextChunk[] {
  const lines = content.split(/\r?\n/);
  const maxLines = Math.max(1, options.maxLines ?? DEFAULT_MAX_LINES);
  const chunks: SourceTextChunk[] = [];

  for (let index = 0; index < lines.length; index += maxLines) {
    const selected = lines.slice(index, index + maxLines);
    chunks.push({
      chunkId: `lines-${index + 1}-${index + selected.length}`,
      chunkType: index === 0 ? "file_head" : "code_window",
      startLine: index + 1,
      endLine: index + selected.length,
      content: selected.join("\n"),
      tokenCount: selected.join(" ").split(/\s+/).filter(Boolean).length
    });
  }

  return chunks;
}
```

- [ ] **Step 5: Extend schema**

Update `packages/source-index/src/schema.ts` to create:

```sql
CREATE TABLE IF NOT EXISTS source_chunks (
  path TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  chunk_type TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY(path, chunk_id),
  FOREIGN KEY(path) REFERENCES files(path) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS fts_chunks
  USING fts5(path UNINDEXED, chunk_id UNINDEXED, content);
```

- [ ] **Step 6: Insert chunks during build**

In `packages/source-index/src/indexer.ts`, import `chunkSourceText` and insert chunks for every text-indexable file.

```ts
const insertChunk = database.prepare(
  [
    "INSERT INTO source_chunks(path, chunk_id, chunk_type, start_line, end_line, token_count, content)",
    "VALUES (?, ?, ?, ?, ?, ?, ?)"
  ].join(" ")
);
const insertChunkText = database.prepare(
  "INSERT INTO fts_chunks(path, chunk_id, content) VALUES (?, ?, ?)"
);
```

- [ ] **Step 7: Return chunk matches**

In text query branch, join `fts_chunks`, `source_chunks`, and `files`, and map `startLine`, `endLine`, `chunkId`, `matchReasons`.

Expected reasons:

```ts
["fts_chunk", `term:${firstQueryTerm}`]
```

- [ ] **Step 8: Run tests**

Run:

```bash
pnpm exec vitest run packages/source-index/src/indexer.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit**

```bash
git add packages/source-index/src
git commit -m "feat(source-index): index searchable chunks"
```

## Task 2: FTS Fallback And Ranking Reasons

**Files:**
- Create: `packages/source-index/src/query-ranking.ts`
- Modify: `packages/source-index/src/indexer.ts`
- Test: `packages/source-index/src/indexer.test.ts`

- [ ] **Step 1: Add failing fallback test**

Add:

```ts
it("falls back to bounded LIKE search for punctuation-heavy queries", async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-index-fallback-"));
  const javaPath = join(sourceRoot, "demo", "Renderer.java");
  const databasePath = join(sourceRoot, "source-index.sqlite");

  await mkdir(join(javaPath, ".."), { recursive: true });
  await writeFile(javaPath, "class Renderer { void draw() { RenderSystem.enableBlend(); } }\n");
  await buildSourceIndex({ sourceRoot, databasePath, packageId: "demo" });

  expect(
    querySourceIndex({
      databasePath,
      text: "RenderSystem.enableBlend()??",
      limit: 5
    }).matches[0]
  ).toMatchObject({
    path: "demo/Renderer.java",
    matchReasons: expect.arrayContaining(["like_fallback"])
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm exec vitest run packages/source-index/src/indexer.test.ts
```

Expected: fail because quoted FTS phrase does not fallback.

- [ ] **Step 3: Add query-ranking helper**

Create `packages/source-index/src/query-ranking.ts`:

```ts
export function normalizeSearchTerms(query: string): string[] {
  return query
    .split(/[^A-Za-z0-9_.$:/-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 8);
}

export function buildMatchReasons(input: {
  mode: "fts_chunk" | "like_fallback" | "symbol";
  query: string;
  path?: string;
}): string[] {
  const terms = normalizeSearchTerms(input.query).slice(0, 3);
  return [
    input.mode,
    ...terms.map((term) => `term:${term}`),
    ...(input.path && terms.some((term) => input.path?.includes(term))
      ? ["path_match"]
      : [])
  ];
}
```

- [ ] **Step 4: Add fallback path**

In `selectMatches`, when FTS returns no rows or throws, run bounded LIKE against `source_chunks.content`.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm exec vitest run packages/source-index/src/indexer.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/source-index/src
git commit -m "feat(source-index): explain fallback matches"
```

## Task 3: Docs Search Match Reasons

**Files:**
- Modify: `packages/docs-retrieval/src/search.ts`
- Modify: `packages/docs-retrieval/src/search.test.ts`

- [ ] **Step 1: Add failing test assertion**

In `packages/docs-retrieval/src/search.test.ts`, extend the first test:

```ts
expect(result.hits[0]).toMatchObject({
  matchReasons: expect.arrayContaining([
    expect.stringMatching(/^search_term:/)
  ])
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @mcpskill/docs-retrieval test
```

Expected: fail because `DocsSearchHit` has no `matchReasons`.

- [ ] **Step 3: Add `matchReasons`**

In `DocsSearchHit`, add:

```ts
matchReasons: string[];
```

In `buildHit`, collect reasons based on signal source:

```ts
matchReasons.add(`${signal.source}:${signal.term.toLowerCase()}`);
```

Change `buildSignals` to return `{ term, weight, source }`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @mcpskill/docs-retrieval test
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/docs-retrieval/src/search.ts packages/docs-retrieval/src/search.test.ts
git commit -m "feat(docs): explain selected document matches"
```

## Task 4: Mod Archive Pre-Decompile Analysis

**Files:**
- Create: `packages/jar-source-adapter/src/mod-archive-analysis.ts`
- Create: `packages/jar-source-adapter/src/mod-archive-analysis.test.ts`
- Modify: `packages/jar-source-adapter/src/index.ts`
- Modify: `packages/jar-source-adapter/package.json`

- [ ] **Step 1: Write failing test**

Create fixture-backed test that builds a JAR with:

```text
fabric.mod.json
META-INF/mods.toml
demo.mixins.json
demo.accesswidener
META-INF/services/demo.Service
assets/demo/models/block/gear.json
data/demo/recipes/gear.json
demo/Client.class
```

Expected summary:

```ts
{
  mixinConfigCount: 1,
  accessWidenerCount: 1,
  serviceProviderCount: 1,
  classFileCount: 1,
  assetFileCount: 1,
  dataFileCount: 1
}
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm exec vitest run packages/jar-source-adapter/src/mod-archive-analysis.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement analyzer**

Use existing `listArchiveContent` and count paths. Return compact payload only:

```ts
export interface ModArchivePreDecompileAnalysis {
  sourceArchive: string;
  tokenPolicy: "compact_mod_archive_pre_decompile_analysis";
  mixinConfigCount: number;
  accessWidenerCount: number;
  serviceProviderCount: number;
  classFileCount: number;
  assetFileCount: number;
  dataFileCount: number;
  needsSourceDecompileReasons: string[];
}
```

- [ ] **Step 4: Run package tests**

Run:

```bash
pnpm --filter @mcpskill/jar-source-adapter test
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/jar-source-adapter
git commit -m "feat(jar): summarize pre-decompile evidence"
```

## Task 5: Remap/Decompile Job State Contract

**Files:**
- Create: `packages/source-package-manager/src/source-job-state.ts`
- Create: `packages/source-package-manager/src/source-job-state.test.ts`
- Modify: `packages/source-package-manager/src/index.ts`
- Modify: `packages/source-package-manager/package.json`

- [ ] **Step 1: Write failing test**

Test:

```ts
expect(
  createSourceAcquisitionJobState({
    packageId: "minecraft-1.20.1-source-pack-named",
    minecraftVersion: "1.20.1",
    artifact: "client"
  })
).toMatchObject({
  status: "needs_confirmation",
  hasJar: false,
  hasMappings: false,
  hasRemappedJar: false,
  hasDecompiledSource: false,
  hasSourceIndex: false,
  lockKey: "minecraft-1.20.1-source-pack-named:client"
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm exec vitest run packages/source-package-manager/src/source-job-state.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement pure state helpers**

Statuses:

```ts
export type SourceAcquisitionJobStatus =
  | "needs_confirmation"
  | "installing"
  | "ready"
  | "failed";
```

Include `transitionSourceAcquisitionJobState(state, event)` with events:

```ts
"confirm" | "jar_ready" | "mappings_ready" | "remapped_ready" | "decompiled_ready" | "indexed" | "fail"
```

- [ ] **Step 4: Run package tests**

Run:

```bash
pnpm --filter @mcpskill/source-package-manager test
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/source-package-manager
git commit -m "feat(packages): define source acquisition job state"
```

## Task 6: Mixin Target Verifier Skeleton

**Files:**
- Create: `apps/mcp-server/src/mixin-target-verifier.ts`
- Create: `apps/mcp-server/src/mixin-target-verifier.test.ts`

- [ ] **Step 1: Write failing verifier test**

Test:

```ts
expect(
  verifyMixinTarget({
    requestedTarget: "net.minecraft.world.item.ItemStack",
    availableClasses: [
      "net.minecraft.world.item.ItemStack",
      "net.minecraft.world.item.Items"
    ]
  })
).toEqual({
  status: "valid",
  requestedTarget: "net.minecraft.world.item.ItemStack",
  candidates: ["net.minecraft.world.item.ItemStack"],
  nextReads: []
});
```

Also test missing target returns:

```ts
{
  status: "missing_target",
  candidates: ["net.minecraft.world.item.Items"],
  nextReads: []
}
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm --filter @mcpskill/mcp-server test -- mixin-target-verifier.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement pure verifier skeleton**

Do not wire into public tool yet. Implement a pure helper:

```ts
export type MixinTargetVerificationStatus =
  | "valid"
  | "missing_target"
  | "ambiguous_target"
  | "source_unavailable";
```

Use exact match first, then same package/simple-name prefix candidates.

- [ ] **Step 4: Run MCP server tests**

Run:

```bash
pnpm --filter @mcpskill/mcp-server test -- mixin-target-verifier.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mcp-server/src/mixin-target-verifier.ts apps/mcp-server/src/mixin-target-verifier.test.ts
git commit -m "feat(mcp): add mixin target verifier skeleton"
```

## Task 7: Verification And Documentation

**Files:**
- Modify: `docs/specs/reference-mcp-architecture-absorption-backlog.md`
- Create: `docs/reviews/2026-05-05-reference-mcp-absorption-verification.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm test
find apps packages tests -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1 > 500 && $2 != "total" { print }'
git diff --check
```

Expected:

- `pnpm test` exits 0.
- line guard prints nothing.
- `git diff --check` prints nothing.

- [ ] **Step 2: Write verification review**

Create `docs/reviews/2026-05-05-reference-mcp-absorption-verification.md` with:

```md
# Reference MCP Absorption Verification

Date: 2026-05-05
Author: m1hono

## Implemented

- Source index chunks and match reasons.
- Docs match reasons.
- Mod archive pre-decompile analysis.
- Source acquisition job state contract.
- Mixin target verifier skeleton.

## Verification

- `pnpm test`: passed
- 500-line guard: passed
- `git diff --check`: passed

## Remaining

- Wire verifier into `mc_develop` evidence route.
- Implement actual remap/decompile job executor.
- Add method/field-level migration comparison.
```

- [ ] **Step 3: Commit**

```bash
git add docs/specs/reference-mcp-architecture-absorption-backlog.md docs/reviews
git commit -m "docs: verify reference mcp absorption slice"
```

## Final Verification

- [ ] Run:

```bash
pnpm test
find apps packages tests -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '$1 > 500 && $2 != "total" { print }'
git diff --check
```

- [ ] Push:

```bash
git push origin skill-update
```

## Self-Review

- Spec coverage: covers chunked docs/source indexing, FTS fallback, line-range follow-up, mod archive pre-decompile analysis, job state, verifier skeleton, and docs verification.
- Placeholder scan: no unresolved placeholders remain.
- Type consistency: task type names match proposed files and exported helpers.
- Public MCP surface: no new public tool is introduced.
