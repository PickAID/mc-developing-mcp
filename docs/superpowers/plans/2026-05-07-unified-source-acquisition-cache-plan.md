# Unified Source Acquisition Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified source acquisition pipeline that can use Modrinth, CurseForge, official Minecraft, GitHub, local/user jars, runtime cache, Gradle, and ProbeJS without requiring a workspace.

**Architecture:** `@mcpskill/source-package-manager` owns the source acquisition route plan. Existing packages execute route-specific work: external resolver for Modrinth/CurseForge/Maven, jar-source-adapter for jar-derived indexes, gradle-adapter for workspace dependencies, ProbeJS services for KubeJS metadata, and resource-registry for runtime package cache state.

**Tech Stack:** TypeScript, Vitest, runtime-local cache directories, SQLite indexes through existing source/jar/docs index packages.

---

### Task 1: Source Acquisition Route Planner

**Files:**
- Create: `packages/source-package-manager/src/source-acquisition-plan.ts`
- Create: `packages/source-package-manager/src/source-acquisition-plan.test.ts`
- Modify: `packages/source-package-manager/src/index.ts`
- Review: `docs/superpowers/specs/2026-05-07-unified-source-acquisition-cache-spec.md`

- [x] **Step 1: Write the failing test**

```ts
expect(planSourceAcquisition({
  request: {
    purpose: "source_lookup",
    minecraftVersion: "1.21.1",
    loader: "neoforge",
    userJarPaths: ["/packs/libs/example.jar"],
    remoteSources: ["modrinth", "curseforge", "official", "github"]
  },
  workspace: { available: false },
  policies: { remoteDownloads: "confirm", curseforgeCredentials: false }
}).routes.map((route) => route.origin)).toEqual([
  "runtime_cache",
  "user_jar",
  "official",
  "modrinth",
  "curseforge",
  "github"
]);
```

- [x] **Step 2: Verify red**

Run:

```bash
pnpm --filter @mcpskill/source-package-manager test -- source-acquisition-plan.test.ts
```

Expected initial failure:

```text
Cannot find module './source-acquisition-plan.js'
```

- [x] **Step 3: Implement route planner**

Create `SourceAcquisitionOrigin`, `SourceAcquisitionRoute`, `SourceAcquisitionPlanInput`, and `planSourceAcquisition`. The planner must:

- include workspace Gradle and ProbeJS routes only when available;
- always include runtime cache;
- include local/user jar routes when paths are present;
- sort remote origins as official, Modrinth, CurseForge, GitHub regardless of user input order;
- set `requiresWorkspace: false` on the overall plan;
- expose warnings for denied remote downloads and missing CurseForge credentials.

- [x] **Step 4: Verify green**

Run:

```bash
pnpm --filter @mcpskill/source-package-manager test -- source-acquisition-plan.test.ts
```

Expected result:

```text
Test Files  14 passed (14)
Tests       58 passed (58)
```

### Task 2: Route Planner MCP Evidence

**Files:**
- Modify: `apps/mcp-server/src/request/evidence/evidence-plan.ts`
- Modify: `apps/mcp-server/src/request/execution/request-executor.ts`
- Test: `apps/mcp-server/src/request/evidence/evidence-plan-source-acquisition.test.ts`

- [x] **Step 1: Write MCP evidence test**

```ts
it("adds source acquisition planning before remote mod lookup", () => {
  const result = buildEvidencePlanForRequest({
    requestText: "Find source for a NeoForge mod from Modrinth without a workspace",
    workspace: { available: false }
  });

  expect(result.candidates).toContainEqual(
    expect.objectContaining({
      routeStep: "source_acquisition_plan"
    })
  );
});
```

- [x] **Step 2: Run targeted test**

Run:

```bash
pnpm --filter @mcpskill/mcp-server test -- request/evidence/evidence-plan-source-acquisition.test.ts
```

Expected: fail because `source_acquisition_plan` is not yet wired.

- [x] **Step 3: Add internal evidence route**

Add an internal route step named `source_acquisition_plan`. It should return compact structured content:

```ts
{
  source: "source_acquisition_plan",
  requiresWorkspace: false,
  routes: plan.routes.map(({ origin, artifactStrategy, cacheMode, warnings }) => ({
    origin,
    artifactStrategy,
    cacheMode,
    warnings
  }))
}
```

- [x] **Step 4: Run test and full MCP server target**

Run:

```bash
pnpm --filter @mcpskill/mcp-server test -- request/evidence/evidence-plan-source-acquisition.test.ts
```

Expected: pass.

### Task 3: Jar Acquisition Package Hand-Off

**Files:**
- Modify: `packages/source-package-manager/src/source-acquisition-plan.ts`
- Create: `packages/source-package-manager/src/source-acquisition-hand-off.ts`
- Create: `packages/source-package-manager/src/source-acquisition-hand-off.test.ts`

- [x] **Step 1: Write hand-off test**

```ts
it("turns a local jar route into a jar index work item", () => {
  const workItems = buildSourceAcquisitionWorkItems({
    route: {
      origin: "user_jar",
      artifactStrategy: "index_binary_jar",
      cacheMode: "runtime_artifact_cache"
    },
    paths: ["/packs/libs/example.jar"]
  });

  expect(workItems).toEqual([
    {
      kind: "jar_index",
      sourceArchive: "/packs/libs/example.jar",
      cacheScope: "private_runtime"
    }
  ]);
});
```

- [x] **Step 2: Implement work item builder**

Support initial work item kinds:

```ts
type SourceAcquisitionWorkItem =
  | { kind: "jar_index"; sourceArchive: string; cacheScope: "private_runtime" }
  | { kind: "vanilla_generation"; minecraftVersion: string; cacheScope: "private_runtime" }
  | { kind: "remote_metadata"; source: "modrinth" | "curseforge" | "github"; cacheScope: "metadata" };
```

- [x] **Step 3: Verify**

Run:

```bash
pnpm --filter @mcpskill/source-package-manager test -- source-acquisition-hand-off.test.ts
```

Expected: pass.

### Task 4: Runtime Cache Evidence Contract

**Files:**
- Modify: `packages/resource-registry/src/manifest.ts`
- Modify: `packages/resource-registry/src/package-metadata.ts`
- Test: `packages/resource-registry/src/package-metadata.test.ts`

- [x] **Step 1: Write metadata test**

```ts
expect(resolveMdmResourcePackageMetadata({
  storageKind: "generated_local_cache"
}, {
  packageId: "mod/create/source-index",
  required: false,
  format: "sqlite",
  sourcePath: "generated:modpack-cache"
})).toMatchObject({
  storageKind: "generated_local_cache",
  installTier: "private_local_cache",
  commitPolicy: "private_generated_cache"
});
```

- [x] **Step 2: Ensure generated indexes remain private**

If any metadata branch infers repository commit policy for generated local cache, change it to `private_generated_cache`.

- [x] **Step 3: Verify**

Run:

```bash
pnpm --filter @mcpskill/resource-registry test -- package-metadata.test.ts
```

Expected: pass.

### Task 5: Full Verification Report

**Files:**
- Create: `docs/reviews/2026-05-07-unified-source-acquisition-cache-verification.md`

- [x] **Step 1: Record route outputs**

Include actual `planSourceAcquisition` results for:

- no workspace, user jar, official, Modrinth, CurseForge, GitHub;
- workspace with Gradle and ProbeJS plus local jar;
- remote downloads denied;
- missing CurseForge credentials.

- [x] **Step 2: Run full tests**

Run:

```bash
pnpm test
```

Expected: all tests pass.

- [x] **Step 3: Line guard**

Run:

```bash
wc -l packages/source-package-manager/src/source-acquisition-plan.ts packages/source-package-manager/src/source-acquisition-plan.test.ts
```

Expected: each file stays under 500 lines.
