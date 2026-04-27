# All-TypeScript Foundation And Runtime Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `SKillUpdate` 中建立全 TypeScript monorepo 基线，并交付第一批可运行、可测试的 runtime bootstrap 与 harness/core 壳层，作为后续迁移 Go 逻辑的稳定起点。

**Architecture:** 这份计划只覆盖新 spec 的第一段可执行范围：TypeScript workspace foundation、关键 package 边界、managed runtime bootstrap contract、以及 `agent-runtime` / `mcp-server` 的最小组合壳层。现有 Go 代码保留为只读参考，不在本计划里删除、不做业务逻辑迁移；JDTLS/Gradle adapter、docs inject、workspace detector、eval harness 行为实现进入后续顺序计划。

**Tech Stack:** `pnpm` workspaces、TypeScript 5.x、Vitest、Node.js 22 LTS、`tsx`、project references、现有 `cmd/` / `internal/` / `testdata/` 只读保留。

---

## Scope Split

原 spec 覆盖多个独立子系统：

- TypeScript monorepo
- runtime manager
- workspace detector
- Java / Gradle / jar / docs adapters
- MCP core
- agent harness
- docs inject
- eval harness

为了避免计划链过长，这份 implementation plan 只实现：

- TypeScript monorepo foundation
- workspace package/app skeleton
- managed runtime bootstrap contract
- `agent-runtime` / `mcp-server` composition shell
- phase 1 verification and review export

这份计划明确不实现：

- 删除现有 Go 代码
- 端到端 JDTLS 下载与启动
- 真实 Gradle model 读取
- docs inject ranking
- agent harness policy engine
- eval harness scenario execution
- `mdm-sources` TypeScript maintenance tooling

这些进入后续顺序计划。当前目标是先把新轨道立起来，并让后续迁移工作不再依赖 Go-only 项目结构。

## Repo Roots

- `SKillUpdate`: `/Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate`

以下路径均相对于 `SKillUpdate` 根目录。

## Existing Code To Keep Intact

本阶段不要修改这些现有 Go 路径：

- `go.mod`
- `internal/**`
- `testdata/**`
- `tmp/**`

它们在 phase 1 中只作为迁移参考和语义对照，不作为新主线继续扩展。

## File Structure

**Create**

- `.gitignore`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `tsconfig.json`
- `vitest.config.ts`
- `tests/monorepo/foundation.test.ts`
- `docs/reviews/2026-04-19-go-tree-baseline.sha256`
- `packages/shared-types/package.json`
- `packages/shared-types/tsconfig.json`
- `packages/shared-types/src/index.ts`
- `packages/shared-types/src/runtime.ts`
- `packages/runtime-manager/package.json`
- `packages/runtime-manager/tsconfig.json`
- `packages/runtime-manager/src/index.ts`
- `packages/runtime-manager/src/layout.ts`
- `packages/runtime-manager/src/policy.ts`
- `packages/runtime-manager/src/layout.test.ts`
- `packages/runtime-manager/src/policy.test.ts`
- `packages/agent-harness/package.json`
- `packages/agent-harness/tsconfig.json`
- `packages/agent-harness/src/index.ts`
- `packages/eval-harness/package.json`
- `packages/eval-harness/tsconfig.json`
- `packages/eval-harness/src/index.ts`
- `packages/workspace-detector/package.json`
- `packages/workspace-detector/tsconfig.json`
- `packages/workspace-detector/src/index.ts`
- `packages/java-jdtls-adapter/package.json`
- `packages/java-jdtls-adapter/tsconfig.json`
- `packages/java-jdtls-adapter/src/index.ts`
- `packages/gradle-adapter/package.json`
- `packages/gradle-adapter/tsconfig.json`
- `packages/gradle-adapter/src/index.ts`
- `packages/jar-source-adapter/package.json`
- `packages/jar-source-adapter/tsconfig.json`
- `packages/jar-source-adapter/src/index.ts`
- `packages/kubejs-types-adapter/package.json`
- `packages/kubejs-types-adapter/tsconfig.json`
- `packages/kubejs-types-adapter/src/index.ts`
- `packages/datapack-adapter/package.json`
- `packages/datapack-adapter/tsconfig.json`
- `packages/datapack-adapter/src/index.ts`
- `packages/docs-retrieval/package.json`
- `packages/docs-retrieval/tsconfig.json`
- `packages/docs-retrieval/src/index.ts`
- `packages/package-registry/package.json`
- `packages/package-registry/tsconfig.json`
- `packages/package-registry/src/index.ts`
- `apps/agent-runtime/package.json`
- `apps/agent-runtime/tsconfig.json`
- `apps/agent-runtime/src/index.ts`
- `apps/agent-runtime/src/bootstrap.ts`
- `apps/agent-runtime/src/bootstrap.test.ts`
- `apps/mcp-server/package.json`
- `apps/mcp-server/tsconfig.json`
- `apps/mcp-server/src/index.ts`
- `apps/mcp-server/src/bootstrap.ts`
- `apps/mcp-server/src/bootstrap.test.ts`
- `docs/reviews/2026-04-19-all-typescript-foundation-runtime-bootstrap-verification.md`

**Modify**

- none in existing Go tree

**Boundaries**

- root config files: 只负责 workspace、build、test、ignore 规则
- `packages/shared-types`: 只放 phase 1 共享 contract，不放业务逻辑
- `packages/runtime-manager`: 只放 runtime layout 与 default policy bootstrap，不实现真实下载
- workspace package manifests: phase 1 仍然以 `dist` 作为正式入口，并在跨 package 的 `vitest` 校验前先执行局部 `tsc -b`，避免用 source-level hacks 破坏后续真正的发布与运行边界
- adapter packages: phase 1 只放 package boundary placeholder，不写真实 logic
- `packages/agent-harness` / `packages/eval-harness`: phase 1 只锁定 package 边界
- `apps/agent-runtime`: 只做 harness-side bootstrap shell
- `apps/mcp-server`: 只做 MCP core-side bootstrap shell
- `tests/monorepo/foundation.test.ts`: 只验证 workspace shape，不验证 runtime behavior
- `docs/reviews/...verification.md`: 只记录 phase 1 实测证据

## Task 1: Bootstrap TypeScript Workspace Foundation

**Files:**
- Create: `docs/reviews/2026-04-19-go-tree-baseline.sha256`
- Create: `.gitignore`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tests/monorepo/foundation.test.ts`
- Create: all `apps/*` and `packages/*` skeleton package manifests, tsconfig files, and `src/index.ts` files listed in File Structure

- [ ] **Step 1: Capture a checksum baseline for the existing Go tree**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && find cmd internal testdata -type f -print0 | xargs -0 shasum -a 256 > docs/reviews/2026-04-19-go-tree-baseline.sha256`

Expected: PASS with a checksum manifest covering the pre-existing Go files that must remain unchanged in phase 1.

- [ ] **Step 2: Write the root workspace config**

```json
// package.json
{
  "name": "@mcpskill/workspace",
  "private": true,
  "packageManager": "pnpm@10.8.0",
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf node_modules apps/*/dist packages/*/dist coverage apps/*/tsconfig.tsbuildinfo packages/*/tsconfig.tsbuildinfo"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

```json
// tsconfig.json
{
  "files": [],
  "references": [
    { "path": "./packages/shared-types" },
    { "path": "./packages/runtime-manager" },
    { "path": "./packages/agent-harness" },
    { "path": "./packages/eval-harness" },
    { "path": "./packages/workspace-detector" },
    { "path": "./packages/java-jdtls-adapter" },
    { "path": "./packages/gradle-adapter" },
    { "path": "./packages/jar-source-adapter" },
    { "path": "./packages/kubejs-types-adapter" },
    { "path": "./packages/datapack-adapter" },
    { "path": "./packages/docs-retrieval" },
    { "path": "./packages/package-registry" },
    { "path": "./apps/agent-runtime" },
    { "path": "./apps/mcp-server" }
  ]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts",
      "apps/**/*.test.ts",
      "packages/**/*.test.ts"
    ],
    environment: "node"
  }
});
```

```gitignore
# .gitignore
node_modules/
apps/*/dist/
packages/*/dist/
coverage/
.runtime-cache/
.vitest/
apps/*/tsconfig.tsbuildinfo
packages/*/tsconfig.tsbuildinfo
```

- [ ] **Step 3: Install the root TypeScript toolchain**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm install`

Expected: PASS with a generated `node_modules/` tree and a local lockfile for the working branch.

- [ ] **Step 4: Write the failing workspace-shape test**

```ts
// tests/monorepo/foundation.test.ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..");

describe("workspace foundation", () => {
  it("declares pnpm workspaces for apps and packages", () => {
    const workspaceYaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf-8");
    expect(workspaceYaml).toContain('  - "apps/*"');
    expect(workspaceYaml).toContain('  - "packages/*"');
  });

  it("creates the phase-1 app and package roots", () => {
    const expectedPaths = [
      "apps/agent-runtime/package.json",
      "apps/mcp-server/package.json",
      "packages/shared-types/package.json",
      "packages/runtime-manager/package.json",
      "packages/agent-harness/package.json",
      "packages/eval-harness/package.json",
      "packages/workspace-detector/package.json",
      "packages/java-jdtls-adapter/package.json",
      "packages/gradle-adapter/package.json",
      "packages/jar-source-adapter/package.json",
      "packages/kubejs-types-adapter/package.json",
      "packages/datapack-adapter/package.json",
      "packages/docs-retrieval/package.json",
      "packages/package-registry/package.json"
    ];

    for (const relPath of expectedPaths) {
      expect(existsSync(join(repoRoot, relPath)), relPath).toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run the workspace-shape test to verify it fails**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec vitest run tests/monorepo/foundation.test.ts`

Expected: FAIL because the `apps/*` and `packages/*` package roots do not exist yet.

- [ ] **Step 6: Create the monorepo package and app skeletons**

```bash
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate

mkdir -p \
  apps/agent-runtime/src \
  apps/mcp-server/src \
  packages/shared-types/src \
  packages/runtime-manager/src \
  packages/agent-harness/src \
  packages/eval-harness/src \
  packages/workspace-detector/src \
  packages/java-jdtls-adapter/src \
  packages/gradle-adapter/src \
  packages/jar-source-adapter/src \
  packages/kubejs-types-adapter/src \
  packages/datapack-adapter/src \
  packages/docs-retrieval/src \
  packages/package-registry/src
```

```json
// apps/agent-runtime/package.json
{
  "name": "@mcpskill/agent-runtime",
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
    "test": "vitest run src/bootstrap.test.ts"
  },
  "dependencies": {
    "@mcpskill/agent-harness": "workspace:*",
    "@mcpskill/runtime-manager": "workspace:*",
    "@mcpskill/shared-types": "workspace:*"
  }
}
```

```json
// apps/mcp-server/package.json
{
  "name": "@mcpskill/mcp-server",
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
    "test": "vitest run src/bootstrap.test.ts"
  },
  "dependencies": {
    "@mcpskill/runtime-manager": "workspace:*",
    "@mcpskill/shared-types": "workspace:*"
  }
}
```

```json
// packages/shared-types/package.json
{
  "name": "@mcpskill/shared-types",
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
    "build": "tsc -b"
  }
}
```

```json
// packages/runtime-manager/package.json
{
  "name": "@mcpskill/runtime-manager",
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
    "test": "vitest run src/*.test.ts"
  },
  "dependencies": {
    "@mcpskill/shared-types": "workspace:*"
  }
}
```

```json
// packages/agent-harness/package.json
{
  "name": "@mcpskill/agent-harness",
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
    "build": "tsc -b"
  }
}
```

```json
// packages/eval-harness/package.json
{
  "name": "@mcpskill/eval-harness",
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
    "build": "tsc -b"
  }
}
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
    "build": "tsc -b"
  }
}
```

```json
// packages/java-jdtls-adapter/package.json
{
  "name": "@mcpskill/java-jdtls-adapter",
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
    "build": "tsc -b"
  }
}
```

```json
// packages/gradle-adapter/package.json
{
  "name": "@mcpskill/gradle-adapter",
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
    "build": "tsc -b"
  }
}
```

```json
// packages/jar-source-adapter/package.json
{
  "name": "@mcpskill/jar-source-adapter",
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
    "build": "tsc -b"
  }
}
```

```json
// packages/kubejs-types-adapter/package.json
{
  "name": "@mcpskill/kubejs-types-adapter",
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
    "build": "tsc -b"
  }
}
```

```json
// packages/datapack-adapter/package.json
{
  "name": "@mcpskill/datapack-adapter",
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
    "build": "tsc -b"
  }
}
```

```json
// packages/docs-retrieval/package.json
{
  "name": "@mcpskill/docs-retrieval",
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
    "build": "tsc -b"
  }
}
```

```json
// packages/package-registry/package.json
{
  "name": "@mcpskill/package-registry",
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
    "build": "tsc -b"
  }
}
```

```json
// packages/shared-types/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

```json
// packages/runtime-manager/tsconfig.json
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

```json
// packages/agent-harness/tsconfig.json, packages/eval-harness/tsconfig.json, packages/workspace-detector/tsconfig.json, packages/java-jdtls-adapter/tsconfig.json, packages/gradle-adapter/tsconfig.json, packages/jar-source-adapter/tsconfig.json, packages/kubejs-types-adapter/tsconfig.json, packages/datapack-adapter/tsconfig.json, packages/docs-retrieval/tsconfig.json, packages/package-registry/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

```json
// apps/agent-runtime/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"],
  "references": [
    { "path": "../../packages/agent-harness" },
    { "path": "../../packages/runtime-manager" },
    { "path": "../../packages/shared-types" }
  ]
}
```

```json
// apps/mcp-server/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"],
  "references": [
    { "path": "../../packages/runtime-manager" },
    { "path": "../../packages/shared-types" },
    { "path": "../../packages/workspace-detector" }
  ]
}
```

```ts
// apps/agent-runtime/src/index.ts
export { buildAgentRuntimeBootstrap } from "./bootstrap.js";
```

```ts
// apps/mcp-server/src/index.ts
export { buildMcpServerBootstrap } from "./bootstrap.js";
```

```ts
// packages/shared-types/src/index.ts
export {};
```

```ts
// packages/runtime-manager/src/index.ts
export {};
```

```ts
// packages/agent-harness/src/index.ts
export const AGENT_HARNESS_PACKAGE = "@mcpskill/agent-harness";
```

```ts
// packages/eval-harness/src/index.ts
export const EVAL_HARNESS_PACKAGE = "@mcpskill/eval-harness";
```

```ts
// packages/workspace-detector/src/index.ts
export const WORKSPACE_DETECTOR_PACKAGE = "@mcpskill/workspace-detector";
```

```ts
// packages/java-jdtls-adapter/src/index.ts
export const JAVA_JDTLS_ADAPTER_PACKAGE = "@mcpskill/java-jdtls-adapter";
```

```ts
// packages/gradle-adapter/src/index.ts
export const GRADLE_ADAPTER_PACKAGE = "@mcpskill/gradle-adapter";
```

```ts
// packages/jar-source-adapter/src/index.ts
export const JAR_SOURCE_ADAPTER_PACKAGE = "@mcpskill/jar-source-adapter";
```

```ts
// packages/kubejs-types-adapter/src/index.ts
export const KUBEJS_TYPES_ADAPTER_PACKAGE = "@mcpskill/kubejs-types-adapter";
```

```ts
// packages/datapack-adapter/src/index.ts
export const DATAPACK_ADAPTER_PACKAGE = "@mcpskill/datapack-adapter";
```

```ts
// packages/docs-retrieval/src/index.ts
export const DOCS_RETRIEVAL_PACKAGE = "@mcpskill/docs-retrieval";
```

```ts
// packages/package-registry/src/index.ts
export const PACKAGE_REGISTRY_PACKAGE = "@mcpskill/package-registry";
```

- [ ] **Step 7: Run the workspace-shape test to verify it passes**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec vitest run tests/monorepo/foundation.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json vitest.config.ts tests/monorepo/foundation.test.ts docs/reviews/2026-04-19-go-tree-baseline.sha256 apps packages
git commit -m "chore: bootstrap TypeScript workspace foundation"
```

## Task 2: Implement Shared Runtime Contracts And Managed Layout Bootstrap

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Create: `packages/shared-types/src/runtime.ts`
- Modify: `packages/runtime-manager/src/index.ts`
- Create: `packages/runtime-manager/src/layout.ts`
- Create: `packages/runtime-manager/src/policy.ts`
- Create: `packages/runtime-manager/src/layout.test.ts`
- Create: `packages/runtime-manager/src/policy.test.ts`

- [ ] **Step 1: Write the failing runtime-manager tests**

```ts
// packages/runtime-manager/src/layout.test.ts
import { describe, expect, it } from "vitest";
import { resolveManagedRuntimeLayout } from "./layout.js";

describe("resolveManagedRuntimeLayout", () => {
  it("derives stable cache subdirectories from a runtime root", () => {
    const layout = resolveManagedRuntimeLayout("/tmp/mcpskill-runtime");

    expect(layout.root).toBe("/tmp/mcpskill-runtime");
    expect(layout.downloads).toBe("/tmp/mcpskill-runtime/downloads");
    expect(layout.installs).toBe("/tmp/mcpskill-runtime/installs");
    expect(layout.locks).toBe("/tmp/mcpskill-runtime/locks");
  });
});
```

```ts
// packages/runtime-manager/src/policy.test.ts
import { describe, expect, it } from "vitest";
import { createDefaultRuntimePolicy } from "./policy.js";

describe("createDefaultRuntimePolicy", () => {
  it("defaults to managed-first mode with fallback disabled", () => {
    const policy = createDefaultRuntimePolicy("/tmp/mcpskill-runtime");

    expect(policy.mode).toBe("managed-first");
    expect(policy.allowSystemFallback).toBe(false);
    expect(policy.runtimeRoot).toBe("/tmp/mcpskill-runtime");
    expect(policy.requiredArtifacts).toEqual([
      { id: "jdk", version: "17" },
      { id: "jdtls", version: "latest" },
      { id: "gradle-support", version: "wrapper-aware" }
    ]);
  });
});
```

- [ ] **Step 2: Run the runtime-manager tests to verify they fail**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec vitest run packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts`

Expected: FAIL because `layout.ts` and `policy.ts` do not exist yet.

- [ ] **Step 3: Implement shared runtime contracts and runtime-manager logic**

```ts
// packages/shared-types/src/runtime.ts
export type RuntimeArtifactId = "jdk" | "jdtls" | "gradle-support";

export interface RuntimeArtifactRequest {
  id: RuntimeArtifactId;
  version: string;
}

export interface ManagedRuntimePolicy {
  mode: "managed-first";
  allowSystemFallback: boolean;
  runtimeRoot: string;
  requiredArtifacts: RuntimeArtifactRequest[];
}

export interface ManagedRuntimeLayout {
  root: string;
  downloads: string;
  installs: string;
  locks: string;
}

export interface AgentRuntimeBootstrap {
  appId: "agent-runtime";
  runtimePolicy: ManagedRuntimePolicy;
  harnessPackage: "@mcpskill/agent-harness";
  traceEnabled: true;
}

export interface McpServerBootstrap {
  appId: "mcp-server";
  runtimePolicy: ManagedRuntimePolicy;
  corePackages: string[];
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
```

```ts
// packages/runtime-manager/src/layout.ts
import { join } from "node:path";
import type { ManagedRuntimeLayout } from "@mcpskill/shared-types";

export function resolveManagedRuntimeLayout(runtimeRoot: string): ManagedRuntimeLayout {
  return {
    root: runtimeRoot,
    downloads: join(runtimeRoot, "downloads"),
    installs: join(runtimeRoot, "installs"),
    locks: join(runtimeRoot, "locks")
  };
}
```

```ts
// packages/runtime-manager/src/policy.ts
import type { ManagedRuntimePolicy } from "@mcpskill/shared-types";

export function createDefaultRuntimePolicy(runtimeRoot: string): ManagedRuntimePolicy {
  return {
    mode: "managed-first",
    allowSystemFallback: false,
    runtimeRoot,
    requiredArtifacts: [
      { id: "jdk", version: "17" },
      { id: "jdtls", version: "latest" },
      { id: "gradle-support", version: "wrapper-aware" }
    ]
  };
}
```

```ts
// packages/runtime-manager/src/index.ts
export { resolveManagedRuntimeLayout } from "./layout.js";
export { createDefaultRuntimePolicy } from "./policy.js";
```

- [ ] **Step 4: Build the dependent packages and run the runtime-manager tests**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec tsc -b packages/shared-types packages/runtime-manager && pnpm exec vitest run packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/index.ts packages/shared-types/src/runtime.ts packages/runtime-manager/src/index.ts packages/runtime-manager/src/layout.ts packages/runtime-manager/src/policy.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts
git commit -m "feat: add managed runtime bootstrap contracts"
```

## Task 3: Implement Agent And MCP Bootstrap Shells

**Files:**
- Create: `apps/agent-runtime/src/bootstrap.ts`
- Create: `apps/agent-runtime/src/bootstrap.test.ts`
- Modify: `apps/agent-runtime/src/index.ts`
- Create: `apps/mcp-server/src/bootstrap.ts`
- Create: `apps/mcp-server/src/bootstrap.test.ts`
- Modify: `apps/mcp-server/src/index.ts`

- [ ] **Step 1: Write the failing app-shell tests**

```ts
// apps/agent-runtime/src/bootstrap.test.ts
import { describe, expect, it } from "vitest";
import { buildAgentRuntimeBootstrap } from "./bootstrap.js";

describe("buildAgentRuntimeBootstrap", () => {
  it("builds the phase-1 harness bootstrap with managed runtime policy", () => {
    const bootstrap = buildAgentRuntimeBootstrap("/tmp/mcpskill-runtime");

    expect(bootstrap.appId).toBe("agent-runtime");
    expect(bootstrap.harnessPackage).toBe("@mcpskill/agent-harness");
    expect(bootstrap.traceEnabled).toBe(true);
    expect(bootstrap.runtimePolicy.allowSystemFallback).toBe(false);
  });
});
```

```ts
// apps/mcp-server/src/bootstrap.test.ts
import { describe, expect, it } from "vitest";
import { buildMcpServerBootstrap } from "./bootstrap.js";

describe("buildMcpServerBootstrap", () => {
  it("builds the phase-1 MCP core bootstrap with managed runtime artifacts", () => {
    const bootstrap = buildMcpServerBootstrap("/tmp/mcpskill-runtime");

    expect(bootstrap.appId).toBe("mcp-server");
    expect(bootstrap.runtimePolicy.mode).toBe("managed-first");
    expect(bootstrap.runtimePolicy.requiredArtifacts.map((item) => item.id)).toEqual([
      "jdk",
      "jdtls",
      "gradle-support"
    ]);
    expect(bootstrap.corePackages).toEqual([
      "@mcpskill/runtime-manager",
      "@mcpskill/shared-types",
      "@mcpskill/workspace-detector"
    ]);
  });
});
```

- [ ] **Step 2: Run the app-shell tests to verify they fail**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`

Expected: FAIL because the `bootstrap.ts` files do not exist yet.

- [ ] **Step 3: Implement the agent and server composition shells**

```ts
// apps/agent-runtime/src/bootstrap.ts
import type { AgentRuntimeBootstrap } from "@mcpskill/shared-types";
import { createDefaultRuntimePolicy } from "@mcpskill/runtime-manager";

export function buildAgentRuntimeBootstrap(runtimeRoot: string): AgentRuntimeBootstrap {
  return {
    appId: "agent-runtime",
    runtimePolicy: createDefaultRuntimePolicy(runtimeRoot),
    harnessPackage: "@mcpskill/agent-harness",
    traceEnabled: true
  };
}
```

```ts
// apps/agent-runtime/src/index.ts
export { buildAgentRuntimeBootstrap } from "./bootstrap.js";
```

```ts
// apps/mcp-server/src/bootstrap.ts
import type { McpServerBootstrap } from "@mcpskill/shared-types";
import { createDefaultRuntimePolicy } from "@mcpskill/runtime-manager";

export function buildMcpServerBootstrap(runtimeRoot: string): McpServerBootstrap {
  return {
    appId: "mcp-server",
    runtimePolicy: createDefaultRuntimePolicy(runtimeRoot),
    corePackages: [
      "@mcpskill/runtime-manager",
      "@mcpskill/shared-types",
      "@mcpskill/workspace-detector"
    ]
  };
}
```

```ts
// apps/mcp-server/src/index.ts
export { buildMcpServerBootstrap } from "./bootstrap.js";
```

- [ ] **Step 4: Build the dependent packages and run the app-shell tests**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec tsc -b packages/shared-types packages/runtime-manager packages/agent-harness packages/workspace-detector apps/agent-runtime apps/mcp-server && pnpm exec vitest run apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent-runtime/src/index.ts apps/agent-runtime/src/bootstrap.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/index.ts apps/mcp-server/src/bootstrap.ts apps/mcp-server/src/bootstrap.test.ts
git commit -m "feat: add TypeScript runtime bootstrap shells"
```

## Task 4: Verify Phase 1 Foundation And Export Review Notes

**Files:**
- Create: `docs/reviews/2026-04-19-all-typescript-foundation-runtime-bootstrap-verification.md`

- [ ] **Step 1: Write the failing verification stub**

````md
# All-TypeScript Foundation And Runtime Bootstrap Verification

Date: 2026-04-19
Author: m1hono
Status: FAIL pending local verification

## Required Evidence

- workspace shape test passes
- runtime-manager tests pass
- app-shell tests pass
- root typecheck passes
- pre-existing Go tree checksum baseline still verifies after phase 1
````

- [ ] **Step 2: Run the focused local verification**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec tsc -b`

Expected: PASS.

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts`

Expected: PASS.

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256`

Expected: PASS with `OK` for every file listed under `cmd/`, `internal/`, and `testdata/`.

- [ ] **Step 3: Write the markdown review with actual observed values**

````md
# All-TypeScript Foundation And Runtime Bootstrap Verification

Date: 2026-04-19
Author: m1hono
Status: PASS

## Commands

```bash
cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate
pnpm exec tsc -b
pnpm exec vitest run tests/monorepo/foundation.test.ts packages/runtime-manager/src/layout.test.ts packages/runtime-manager/src/policy.test.ts apps/agent-runtime/src/bootstrap.test.ts apps/mcp-server/src/bootstrap.test.ts
shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256
```

## Observed Values

- workspace root exposed `apps/*` and `packages/*` through `pnpm-workspace.yaml`
- the phase-1 TypeScript package roots existed for apps, harness, runtime-manager, adapters, and registry
- `createDefaultRuntimePolicy("/tmp/mcpskill-runtime")` returned `mode="managed-first"` with `allowSystemFallback=false`
- `buildAgentRuntimeBootstrap` and `buildMcpServerBootstrap` both composed the managed runtime policy correctly
- `shasum -a 256 -c docs/reviews/2026-04-19-go-tree-baseline.sha256` returned `OK` for the pre-existing `cmd/`, `internal/`, and `testdata/` files
````

- [ ] **Step 4: Run the final root command set**

Run: `cd /Users/gedwen/Documents/programing/MCProgrammingSkill/SKillUpdate && pnpm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/reviews/2026-04-19-all-typescript-foundation-runtime-bootstrap-verification.md
git commit -m "test: verify TypeScript foundation runtime bootstrap"
```

## Self-Review

- Spec coverage:
  - all-TypeScript workspace foundation: Task 1
  - managed runtime bootstrap contract: Task 2
  - separate agent harness and MCP core shell entrypoints: Task 3
  - review/export verification: Task 4
- Scope check:
  - runtime download implementation, adapters, docs inject behavior, and Go logic migration are explicitly excluded and left for later plans
- Type consistency:
  - runtime policy stays `managed-first`
  - system fallback remains available in architecture but disabled by default in phase 1
  - harness and MCP shell packages consume the same shared runtime contract
