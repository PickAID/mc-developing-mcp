# TypeScript Workspace Runtime Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `SKillUpdate` 的 TypeScript monorepo 中实现第一段真正可用的 `workspace-detector`：从工作区文件和可选 Prism hint 里检测当前 Minecraft runtime，并把结果稳定输出为结构化 `WorkspaceDescriptor` / `CurrentRuntime`。

**Architecture:** 这一阶段只实现 package-level 的 runtime detection vertical slice，不引入新的 MCP tool surface，也不启动 JDTLS / Gradle sidecar。实现重点是：扩展 `shared-types` 的工作区与 runtime detection contract、在 `workspace-detector` 中建立 filesystem-first 的扫描与证据聚合、并把高/中/低置信度与冲突候选表达清楚，让后续 app/harness 可以直接消费结果而不用再猜版本和 loader。

**Tech Stack:** `pnpm` workspaces、TypeScript 5.x、Node.js 22 LTS、Vitest、Node stdlib `fs/promises` / `path` / `os`、已有 phase-1 `shared-types` / `runtime-manager` / app bootstrap 基线。

---

## Feasibility Notes

**Protocol reference checked:** official MCP docs / TypeScript SDK server pattern (`modelcontextprotocol.io`).
Borrowed pattern:
- keep protocol/server transport thin
- keep domain logic in standalone packages with stable public APIs

Adapted here:
- `workspace-detector` remains a pure package API instead of being entangled with `apps/mcp-server`
- this phase only exports a typed detection API; it does not add MCP transport handlers yet

Intentionally not copied:
- no MCP transport layer wiring
- no tool registration in this phase

**Domain references checked:** PrismLauncher instance layout and KubeJS / ProbeJS folder conventions.
Borrowed pattern:
- Prism instance roots follow `instances/<name>/minecraft`
- KubeJS workspaces center around a `kubejs/` root and optional Probe/typing artifacts

Adapted here:
- Prism is hint-only and never authoritative
- KubeJS / ProbeJS detection stays shallow in this phase and only affects workspace facts, not runtime truth by itself

Intentionally not copied:
- no launcher metadata dependency
- no ProbeJS parsing or snippet loading yet

## Scope Split

This phase implements only:

- `shared-types` workspace/runtime detection contracts
- `workspace-detector` package-level filesystem scan
- current runtime inference from:
  - Gradle dependency coordinates
  - mod metadata files
  - datapack `pack.mcmeta`
  - optional Prism instance-path hints
- focused package verification and Markdown review export

This phase does **not** implement:

- JDTLS startup
- Gradle sidecar model import
- jar-source retrieval
- docs inject
- app-level `workspace.detect` transport surface
- automatic downstream autofill into harness / query / migration layers

Those remain later phases.

## Repo Root

- `SKillUpdate`: `/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate`

All paths below are relative to that root.

## File Structure

**Create**

- `packages/shared-types/src/workspace.ts`
- `packages/workspace-detector/src/detect.ts`
- `packages/workspace-detector/src/filesystem.ts`
- `packages/workspace-detector/src/collect-gradle.ts`
- `packages/workspace-detector/src/collect-metadata.ts`
- `packages/workspace-detector/src/collect-hints.ts`
- `packages/workspace-detector/src/runtime.ts`
- `packages/workspace-detector/src/detect.test.ts`
- `docs/reviews/2026-04-20-typescript-workspace-runtime-detection-verification.md`

**Modify**

- `packages/shared-types/src/index.ts`
- `packages/workspace-detector/package.json`
- `packages/workspace-detector/tsconfig.json`
- `packages/workspace-detector/src/index.ts`

**Boundaries**

- `packages/shared-types/src/workspace.ts`
  owns only shared TS contracts for workspace/runtime detection
- `packages/workspace-detector/src/filesystem.ts`
  owns only workspace file presence / root discovery
- `packages/workspace-detector/src/collect-*.ts`
  own only one evidence source family each
- `packages/workspace-detector/src/runtime.ts`
  owns confidence / candidate resolution only
- `packages/workspace-detector/src/detect.ts`
  owns orchestration and `WorkspaceDescriptor` shaping
- `docs/reviews/...verification.md`
  records only real command outputs from this machine

## Task 1: Add Shared Contracts And Detector RED Tests

**Files:**
- Create: `packages/shared-types/src/workspace.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `packages/workspace-detector/package.json`
- Modify: `packages/workspace-detector/tsconfig.json`
- Create: `packages/workspace-detector/src/detect.test.ts`

- [ ] **Step 1: Write the failing detector tests**

```ts
// packages/workspace-detector/src/detect.test.ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { detectWorkspace } from "./detect.js";

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("detectWorkspace", () => {
  it("detects high-confidence forge runtime from gradle and mods metadata", async () => {
    const root = createTempRoot("forge-runtime");
    const metaInfRoot = join(root, "src", "main", "resources", "META-INF");

    mkdirSync(metaInfRoot, { recursive: true });
    mkdirSync(join(root, "src", "main", "java", "example"), { recursive: true });

    writeFileSync(
      join(root, "build.gradle"),
      [
        'plugins { id "net.minecraftforge.gradle" }',
        "dependencies {",
        '  minecraft "net.minecraftforge:forge:1.20.1-47.2.0"',
        "}"
      ].join("\n")
    );
    writeFileSync(
      join(metaInfRoot, "mods.toml"),
      ['modLoader="javafml"', 'loaderVersion="[47,)"'].join("\n")
    );

    const detected = await detectWorkspace(root);

    expect(detected.kind).toBe("java-mod");
    expect(detected.hasGradle).toBe(true);
    expect(detected.hasJavaSource).toBe(true);
    expect(detected.currentRuntime.minecraftVersion).toBe("1.20.1");
    expect(detected.currentRuntime.loader).toBe("forge");
    expect(detected.currentRuntime.confidence).toBe("high");
  });

  it("returns unknown confidence with conflicting strong forge and neoforge evidence", async () => {
    const root = createTempRoot("conflicting-runtime");
    const metaInfRoot = join(root, "src", "main", "resources", "META-INF");

    mkdirSync(metaInfRoot, { recursive: true });

    writeFileSync(
      join(root, "build.gradle"),
      'dependencies { minecraft "net.minecraftforge:forge:1.20.1-47.2.0" }'
    );
    writeFileSync(
      join(metaInfRoot, "neoforge.mods.toml"),
      'loaderVersion="[21,)"'
    );

    const detected = await detectWorkspace(root);

    expect(detected.currentRuntime.confidence).toBe("unknown");
    expect(detected.currentRuntime.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("allows partial version-only runtime from pack.mcmeta", async () => {
    const root = createTempRoot("datapack-runtime");
    const resourcesRoot = join(root, "src", "main", "resources");

    mkdirSync(join(resourcesRoot, "data", "example"), { recursive: true });
    writeFileSync(
      join(resourcesRoot, "pack.mcmeta"),
      JSON.stringify({
        pack: {
          pack_format: 15
        }
      })
    );

    const detected = await detectWorkspace(root);

    expect(detected.hasDatapack).toBe(true);
    expect(detected.currentRuntime.minecraftVersion).toBe("1.20.1");
    expect(detected.currentRuntime.loader).toBeUndefined();
  });

  it("keeps prism instance layout as low-confidence hint only", async () => {
    const prismRoot = createTempRoot("prism-root");
    const minecraftRoot = join(
      prismRoot,
      "instances",
      "LostCivilization",
      "minecraft"
    );

    mkdirSync(minecraftRoot, { recursive: true });

    const detected = await detectWorkspace(minecraftRoot, { prismRoot });

    expect(detected.currentRuntime.confidence).toBe("low");
    expect(detected.currentRuntime.minecraftVersion).toBeUndefined();
    expect(detected.currentRuntime.loader).toBeUndefined();
    expect(
      detected.currentRuntime.evidence.some(
        (entry) => entry.kind === "prism-instance-root"
      )
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the detector tests to verify they fail**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec vitest run packages/workspace-detector/src/detect.test.ts`

Expected: FAIL with missing `./detect.js` and missing shared workspace/runtime types.

- [ ] **Step 3: Add shared workspace/runtime contracts and package wiring**

```ts
// packages/shared-types/src/workspace.ts
export type Loader = "forge" | "neoforge" | "fabric" | "quilt";

export type WorkspaceKind = "unknown" | "java-mod" | "kubejs" | "modpack";

export type RuntimeDetectionSource = "workspace-detect" | "unknown";

export type RuntimeConfidence = "high" | "medium" | "low" | "unknown";

export interface RuntimeEvidence {
  kind: string;
  path: string;
  detail: string;
  value: string;
  weight: RuntimeConfidence;
  structured: boolean;
}

export interface RuntimeCandidate {
  minecraftVersion?: string;
  loader?: Loader;
  loaderVersion?: string;
  confidence: RuntimeConfidence;
  evidenceSources: string[];
}

export interface CurrentRuntime {
  minecraftVersion?: string;
  loader?: Loader;
  loaderVersion?: string;
  source: RuntimeDetectionSource;
  confidence: RuntimeConfidence;
  evidenceSources: string[];
  candidates: RuntimeCandidate[];
  evidence: RuntimeEvidence[];
}

export interface WorkspaceDescriptor {
  root: string;
  kind: WorkspaceKind;
  hasGradle: boolean;
  hasKubeJS: boolean;
  hasProbeJS: boolean;
  hasJavaSource: boolean;
  hasDatapack: boolean;
  buildFiles: string[];
  javaSourceRoots: string[];
  datapackRoots: string[];
  logPaths: string[];
  reasons: string[];
  currentRuntime: CurrentRuntime;
}
```

```ts
// packages/shared-types/src/index.ts
export type {
  AgentRuntimeBootstrap,
  ManagedRuntimeLayout,
  ManagedRuntimePolicy,
  McpServerBootstrap,
  RuntimeArtifactId,
  RuntimeArtifactRequest
} from "./runtime.js";
export type {
  CurrentRuntime,
  Loader,
  RuntimeCandidate,
  RuntimeConfidence,
  RuntimeDetectionSource,
  RuntimeEvidence,
  WorkspaceDescriptor,
  WorkspaceKind
} from "./workspace.js";
```

```json
// packages/workspace-detector/package.json
{
  "name": "@mcpskill/workspace-detector",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run src/detect.test.ts"
  },
  "dependencies": {
    "@mcpskill/shared-types": "workspace:*"
  }
}
```

```json
// packages/workspace-detector/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../shared-types" }]
}
```

- [ ] **Step 4: Refresh workspace linking**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm install`

Expected: PASS and `packages/workspace-detector/node_modules/@mcpskill/shared-types` exists as a workspace link.

- [ ] **Step 5: Run the detector tests again**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec vitest run packages/workspace-detector/src/detect.test.ts`

Expected: FAIL because `detect.ts` and collector implementation still do not exist.

## Task 2: Implement Filesystem Scan, Evidence Collectors, And Runtime Resolution

**Files:**
- Create: `packages/workspace-detector/src/filesystem.ts`
- Create: `packages/workspace-detector/src/collect-gradle.ts`
- Create: `packages/workspace-detector/src/collect-metadata.ts`
- Create: `packages/workspace-detector/src/collect-hints.ts`
- Create: `packages/workspace-detector/src/runtime.ts`
- Create: `packages/workspace-detector/src/detect.ts`
- Modify: `packages/workspace-detector/src/index.ts`

- [ ] **Step 1: Implement workspace scan summary and filesystem helpers**

```ts
// packages/workspace-detector/src/filesystem.ts
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join } from "node:path";

export interface WorkspaceScanSummary {
  root: string;
  buildFiles: string[];
  javaSourceRoots: string[];
  resourceRoots: string[];
  datapackRoots: string[];
  hasGradle: boolean;
  hasKubeJS: boolean;
  hasProbeJS: boolean;
  hasJavaSource: boolean;
}

const BUILD_FILE_CANDIDATES = [
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts"
];

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function scanWorkspace(root: string): Promise<WorkspaceScanSummary> {
  const resolvedRoot = resolve(root);
  const buildFiles = (
    await Promise.all(
      BUILD_FILE_CANDIDATES.map(async (name) => {
        const candidate = join(resolvedRoot, name);
        return (await pathExists(candidate)) ? candidate : undefined;
      })
    )
  ).filter((value): value is string => Boolean(value));

  const javaSourceRoots = (
    await Promise.all(
      [
        join(resolvedRoot, "src", "main", "java"),
        join(resolvedRoot, "src", "client", "java"),
        join(resolvedRoot, "src", "server", "java")
      ].map(async (candidate) => ((await pathExists(candidate)) ? candidate : undefined))
    )
  ).filter((value): value is string => Boolean(value));

  const resourceRoots = (
    await Promise.all(
      [
        join(resolvedRoot, "src", "main", "resources"),
        join(resolvedRoot, "src", "generated", "resources")
      ].map(async (candidate) => ((await pathExists(candidate)) ? candidate : undefined))
    )
  ).filter((value): value is string => Boolean(value));

  const datapackRoots = (
    await Promise.all(
      [
        join(resolvedRoot, "data"),
        join(resolvedRoot, "src", "main", "resources", "data"),
        join(resolvedRoot, "kubejs", "data")
      ].map(async (candidate) => ((await pathExists(candidate)) ? candidate : undefined))
    )
  ).filter((value): value is string => Boolean(value));

  return {
    root: resolvedRoot,
    buildFiles,
    javaSourceRoots,
    resourceRoots,
    datapackRoots,
    hasGradle: buildFiles.length > 0,
    hasKubeJS: await pathExists(join(resolvedRoot, "kubejs")),
    hasProbeJS:
      (await pathExists(join(resolvedRoot, "kubejs", "probe"))) ||
      (await pathExists(join(resolvedRoot, ".probe"))) ||
      (await pathExists(join(resolvedRoot, "probejs"))),
    hasJavaSource: javaSourceRoots.length > 0
  };
}
```

- [ ] **Step 2: Implement evidence resolution helpers**

```ts
// packages/workspace-detector/src/runtime.ts
import type {
  CurrentRuntime,
  Loader,
  RuntimeCandidate,
  RuntimeConfidence,
  RuntimeEvidence
} from "@mcpskill/shared-types";

export interface CollectedRuntimeFact {
  minecraftVersion?: string;
  loader?: Loader;
  loaderVersion?: string;
  confidence: RuntimeConfidence;
  evidence: RuntimeEvidence;
}

const SCORES: Record<RuntimeConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0
};

function makeKey(fact: CollectedRuntimeFact): string {
  return [
    fact.minecraftVersion ?? "",
    fact.loader ?? "",
    fact.loaderVersion ?? ""
  ].join("|");
}

function toCandidate(
  key: string,
  facts: CollectedRuntimeFact[]
): RuntimeCandidate {
  const [minecraftVersion, loader, loaderVersion] = key.split("|");
  const confidence = facts
    .map((fact) => fact.confidence)
    .sort((left, right) => SCORES[right] - SCORES[left])[0] ?? "unknown";

  return {
    minecraftVersion: minecraftVersion || undefined,
    loader: (loader || undefined) as Loader | undefined,
    loaderVersion: loaderVersion || undefined,
    confidence,
    evidenceSources: facts.map((fact) => fact.evidence.path)
  };
}

export function resolveCurrentRuntime(
  facts: CollectedRuntimeFact[]
): CurrentRuntime {
  if (facts.length === 0) {
    return {
      source: "unknown",
      confidence: "unknown",
      evidenceSources: [],
      candidates: [],
      evidence: []
    };
  }

  const grouped = new Map<string, CollectedRuntimeFact[]>();
  for (const fact of facts) {
    const key = makeKey(fact);
    const bucket = grouped.get(key) ?? [];
    bucket.push(fact);
    grouped.set(key, bucket);
  }

  const candidates = [...grouped.entries()]
    .map(([key, bucket]) => toCandidate(key, bucket))
    .sort((left, right) => SCORES[right.confidence] - SCORES[left.confidence]);

  const topConfidence = candidates[0]?.confidence ?? "unknown";
  const topCandidates = candidates.filter(
    (candidate) => candidate.confidence === topConfidence
  );

  if (topCandidates.length > 1 && SCORES[topConfidence] >= SCORES.medium) {
    return {
      source: "workspace-detect",
      confidence: "unknown",
      evidenceSources: facts.map((fact) => fact.evidence.path),
      candidates,
      evidence: facts.map((fact) => fact.evidence)
    };
  }

  const selected = topCandidates[0] ?? candidates[0];

  return {
    minecraftVersion: selected.minecraftVersion,
    loader: selected.loader,
    loaderVersion: selected.loaderVersion,
    source: "workspace-detect",
    confidence: selected.confidence,
    evidenceSources: selected.evidenceSources,
    candidates,
    evidence: facts.map((fact) => fact.evidence)
  };
}
```

- [ ] **Step 3: Implement Gradle, metadata, and Prism-hint collectors**

```ts
// packages/workspace-detector/src/collect-gradle.ts
import { readFile } from "node:fs/promises";

import type { Loader } from "@mcpskill/shared-types";

import type { WorkspaceScanSummary } from "./filesystem.js";
import type { CollectedRuntimeFact } from "./runtime.js";

const FORGE_COORDINATE =
  /net\.minecraftforge:forge:(\d+\.\d+\.\d+)-([0-9][^"'\\s)]*)/g;
const NEOFORGE_COORDINATE =
  /net\.neoforged:neoforge:(\d+\.\d+\.\d+)-([0-9][^"'\\s)]*)/g;

function factFromMatch(
  path: string,
  loader: Loader,
  minecraftVersion: string,
  loaderVersion: string
): CollectedRuntimeFact {
  return {
    minecraftVersion,
    loader,
    loaderVersion,
    confidence: "high",
    evidence: {
      kind: "gradle-coordinate",
      path,
      detail: `${loader}:${minecraftVersion}-${loaderVersion}`,
      value: `${minecraftVersion}-${loaderVersion}`,
      weight: "high",
      structured: true
    }
  };
}

export async function collectGradleFacts(
  summary: WorkspaceScanSummary
): Promise<CollectedRuntimeFact[]> {
  const facts: CollectedRuntimeFact[] = [];

  for (const buildFile of summary.buildFiles) {
    const text = await readFile(buildFile, "utf8");

    for (const match of text.matchAll(FORGE_COORDINATE)) {
      facts.push(factFromMatch(buildFile, "forge", match[1], match[2]));
    }

    for (const match of text.matchAll(NEOFORGE_COORDINATE)) {
      facts.push(factFromMatch(buildFile, "neoforge", match[1], match[2]));
    }
  }

  return facts;
}
```

```ts
// packages/workspace-detector/src/collect-metadata.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkspaceScanSummary } from "./filesystem.js";
import type { CollectedRuntimeFact } from "./runtime.js";

function mapPackFormatToVersion(packFormat: number): string | undefined {
  if (packFormat === 15) {
    return "1.20.1";
  }
  if (packFormat === 48) {
    return "1.21.1";
  }
  return undefined;
}

export async function collectMetadataFacts(
  summary: WorkspaceScanSummary
): Promise<CollectedRuntimeFact[]> {
  const facts: CollectedRuntimeFact[] = [];

  for (const resourceRoot of summary.resourceRoots) {
    const forgeModsToml = join(resourceRoot, "META-INF", "mods.toml");
    const neoForgeModsToml = join(resourceRoot, "META-INF", "neoforge.mods.toml");
    const packMcmeta = join(resourceRoot, "pack.mcmeta");

    try {
      const text = await readFile(forgeModsToml, "utf8");
      const loaderVersion =
        text.match(/loaderVersion\\s*=\\s*"([^"]+)"/)?.[1] ?? "";
      facts.push({
        loader: "forge",
        loaderVersion: loaderVersion || undefined,
        confidence: "high",
        evidence: {
          kind: "mods-toml",
          path: forgeModsToml,
          detail: "mods.toml detected",
          value: loaderVersion,
          weight: "high",
          structured: true
        }
      });
    } catch {
      // missing mods.toml is expected
    }

    try {
      const text = await readFile(neoForgeModsToml, "utf8");
      const loaderVersion =
        text.match(/loaderVersion\\s*=\\s*"([^"]+)"/)?.[1] ?? "";
      facts.push({
        loader: "neoforge",
        loaderVersion: loaderVersion || undefined,
        confidence: "high",
        evidence: {
          kind: "neoforge-mods-toml",
          path: neoForgeModsToml,
          detail: "neoforge.mods.toml detected",
          value: loaderVersion,
          weight: "high",
          structured: true
        }
      });
    } catch {
      // missing neoforge.mods.toml is expected
    }

    try {
      const text = await readFile(packMcmeta, "utf8");
      const decoded = JSON.parse(text) as {
        pack?: {
          pack_format?: number;
          supported_formats?: {
            min_inclusive?: number;
          };
        };
      };
      const packFormat =
        decoded.pack?.pack_format ??
        decoded.pack?.supported_formats?.min_inclusive;
      const minecraftVersion =
        typeof packFormat === "number"
          ? mapPackFormatToVersion(packFormat)
          : undefined;

      if (minecraftVersion) {
        facts.push({
          minecraftVersion,
          confidence: "low",
          evidence: {
            kind: "pack-mcmeta",
            path: packMcmeta,
            detail: "pack.mcmeta detected",
            value: String(packFormat),
            weight: "low",
            structured: true
          }
        });
      }
    } catch {
      // missing or invalid pack.mcmeta is expected
    }
  }

  return facts;
}
```

```ts
// packages/workspace-detector/src/collect-hints.ts
import { normalize, relative, resolve } from "node:path";

import type { CollectedRuntimeFact } from "./runtime.js";

export interface DetectWorkspaceOptions {
  prismRoot?: string;
}

export function collectHintFacts(
  root: string,
  options: DetectWorkspaceOptions
): CollectedRuntimeFact[] {
  if (!options.prismRoot) {
    return [];
  }

  const normalizedRoot = normalize(resolve(root));
  const normalizedPrismRoot = normalize(resolve(options.prismRoot));
  const relativeRoot = relative(normalizedPrismRoot, normalizedRoot);

  if (
    relativeRoot.startsWith(`instances/`) &&
    relativeRoot.split(/[\\\\/]/).at(-1) === "minecraft"
  ) {
    return [
      {
        confidence: "low",
        evidence: {
          kind: "prism-instance-root",
          path: normalizedRoot,
          detail: "workspace root matches Prism instance minecraft path",
          value: relativeRoot,
          weight: "low",
          structured: false
        }
      }
    ];
  }

  return [];
}
```

```ts
// packages/workspace-detector/src/detect.ts
import { resolve } from "node:path";

import type { WorkspaceDescriptor, WorkspaceKind } from "@mcpskill/shared-types";

import { collectGradleFacts } from "./collect-gradle.js";
import {
  collectHintFacts,
  type DetectWorkspaceOptions
} from "./collect-hints.js";
import { collectMetadataFacts } from "./collect-metadata.js";
import { scanWorkspace } from "./filesystem.js";
import { resolveCurrentRuntime } from "./runtime.js";

function classifyWorkspaceKind(
  hasGradle: boolean,
  hasKubeJS: boolean
): WorkspaceKind {
  if (hasGradle && hasKubeJS) {
    return "modpack";
  }
  if (hasGradle) {
    return "java-mod";
  }
  if (hasKubeJS) {
    return "kubejs";
  }
  return "unknown";
}

export async function detectWorkspace(
  root: string,
  options: DetectWorkspaceOptions = {}
): Promise<WorkspaceDescriptor> {
  if (!root) {
    throw new Error("root must not be empty");
  }

  const resolvedRoot = resolve(root);
  const summary = await scanWorkspace(resolvedRoot);
  const [gradleFacts, metadataFacts] = await Promise.all([
    collectGradleFacts(summary),
    collectMetadataFacts(summary)
  ]);
  const hintFacts = collectHintFacts(resolvedRoot, options);
  const currentRuntime = resolveCurrentRuntime([
    ...gradleFacts,
    ...metadataFacts,
    ...hintFacts
  ]);

  const kind = classifyWorkspaceKind(summary.hasGradle, summary.hasKubeJS);
  const reasons =
    kind === "modpack"
      ? ["detected Gradle and KubeJS in the same workspace"]
      : kind === "java-mod"
        ? ["detected Gradle workspace"]
        : kind === "kubejs"
          ? ["detected KubeJS workspace"]
          : [];

  return {
    root: resolvedRoot,
    kind,
    hasGradle: summary.hasGradle,
    hasKubeJS: summary.hasKubeJS,
    hasProbeJS: summary.hasProbeJS,
    hasJavaSource: summary.hasJavaSource,
    hasDatapack: summary.datapackRoots.length > 0,
    buildFiles: summary.buildFiles,
    javaSourceRoots: summary.javaSourceRoots,
    datapackRoots: summary.datapackRoots,
    logPaths: [],
    reasons,
    currentRuntime
  };
}

export type { DetectWorkspaceOptions } from "./collect-hints.js";
```

```ts
// packages/workspace-detector/src/index.ts
export { detectWorkspace } from "./detect.js";
export type { DetectWorkspaceOptions } from "./detect.js";
```

- [ ] **Step 4: Run the detector tests to verify they pass**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec tsc -b packages/shared-types packages/workspace-detector && pnpm exec vitest run packages/workspace-detector/src/detect.test.ts`

Expected: PASS with 4 detector tests green.

## Task 3: Verify The Detector Slice Against The Existing Phase-1 Baseline

**Files:**
- none

- [ ] **Step 1: Run the full focused verification set**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the root typecheck and root test command**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec tsc -b`

Expected: PASS.

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm test`

Expected: PASS.

- [ ] **Step 3: Recheck the Go-tree checksum baseline**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`

Expected: PASS with `: OK` lines only.

## Task 4: Export Actual Verification Results To Markdown

**Files:**
- Create: `docs/reviews/2026-04-20-typescript-workspace-runtime-detection-verification.md`

- [ ] **Step 1: Write the verification stub**

````md
# TypeScript Workspace Runtime Detection Verification

Date: 2026-04-20
Author: m1hono
Status: FAIL pending local verification

## Required Evidence

- detector package tests pass
- phase-1 foundation tests still pass
- root typecheck passes
- root `pnpm test` passes
- Go-tree checksum baseline matches at verification time
````

- [ ] **Step 2: Write the final review with actual command output**

````md
# TypeScript Workspace Runtime Detection Verification

Date: 2026-04-20
Author: m1hono
Status: PASS

## Commands

```sh
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec tsc -b packages/shared-types packages/workspace-detector
pnpm exec vitest run packages/workspace-detector/src/detect.test.ts
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts packages/workspace-detector/src/detect.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
pnpm exec tsc -b
pnpm test
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
```

## Observed Values

- `detectWorkspace()` returned `kind="java-mod"` with `loader="forge"` and `confidence="high"` for a Forge Gradle workspace with `mods.toml`
- conflicting Forge and NeoForge signals returned `confidence="unknown"` with at least two candidates
- datapack `pack.mcmeta` produced a version-only partial runtime result without forcing a loader
- Prism instance layout contributed only a low-confidence hint and did not invent version or loader values
- the phase-1 workspace, runtime-manager, and bootstrap tests remained green after adding workspace detection
- the Go-tree checksum baseline still matched the current `cmd/`, `internal/`, and `testdata/` files at verification time
````

- [ ] **Step 3: Record the real command output, not the template**

Run the commands from Step 2, replace the template placeholders with actual timings / pass counts / sample `: OK` lines, and keep the wording scoped only to what the commands actually proved.

## Self-Review

- Spec coverage:
  - shared workspace/runtime detection contracts: Task 1
  - filesystem-first detector with Gradle, metadata, datapack, and Prism-hint evidence: Task 2
  - compatibility verification against phase-1 baseline: Task 3
  - actual environment return export: Task 4
- Scope check:
  - no MCP transport surface, no Gradle sidecar, no JDTLS startup, no downstream autofill, and no docs/jar retrieval behavior are included here
- Type consistency:
  - `CurrentRuntime` and `WorkspaceDescriptor` live in `shared-types`
  - `workspace-detector` consumes those contracts rather than redefining them locally
  - Prism remains hint-only and weak evidence never upgrades itself into a strong runtime conclusion
