# All-TypeScript Agent Harness And Runtime Design
Date: 2026-04-19
Author: m1hono
Status: Drafted from approved conversation direction, pending written review
Scope: `mdm-sources` maintenance, MCP service runtime, agent harness, docs inject, and eval harness under a single all-TypeScript architecture

## Purpose
The current direction is no longer "TS-first with optional Go workers."

The approved direction is:
- all self-owned implementation code is TypeScript
- no Go
- no Rust
- no skill dependency for core quality
- harness and guiding are built into the system itself
- Java, JDTLS, and Gradle runtimes are managed by the system instead of assumed from the host

This design defines the new system boundary so later plans do not keep drifting between:
- data tools vs agent behavior
- MCP internals vs prompt guidance
- runtime management vs workspace logic

## Core Decisions
### 1. All self-owned code is TypeScript
Every maintained project component is implemented in TypeScript:
- `mdm-sources` maintenance tooling
- MCP core service
- runtime manager
- source and docs retrieval logic
- agent harness
- eval harness

Java is still used as an external runtime because:
- JDTLS is a Java server
- Gradle model access is part of the Java ecosystem

But Java is not a project implementation language. It is a managed dependency.

### 2. The system uses two layers
The system is split into:
- `Agent Harness`
- `MCP Core`

The harness decides how the agent should work.
The MCP core provides the actual capabilities.

This split is required because the target system is not just a toolbox. It is an agent runtime with tool policy, fallback rules, context shaping, and traceability.

### 3. Runtime management is built in
The system manages:
- JDK
- JDTLS
- Gradle-related runtime dependencies needed for workspace analysis

The default mode is:
- managed runtime first
- system runtime fallback available as an escape hatch
- fallback disabled by default

This keeps default behavior reproducible while still allowing recovery in unusual environments.

### 4. Guiding must not depend on skills
The system must guide the agent correctly even when no external skill exists.

That means:
- tool descriptions alone are not enough
- prompt text alone is not enough
- docs inject alone is not enough

The harness must provide built-in policy, planning, context assembly, and fallback behavior.

### 5. Docs inject is structured retrieval, not markdown dumping
The system must not solve guidance by pasting large markdown blocks into the model context.

Instead it must:
- retrieve structured shards
- rank them by scenario relevance
- enforce a token or byte budget
- record why each shard was injected

## System Shape
```text
User Request
  -> Agent Harness
    -> scenario detection
    -> planning
    -> context assembly
    -> tool selection and fallback
  -> MCP Core
    -> runtime manager
    -> workspace detection
    -> adapters
    -> retrieval
    -> package and cache services
  -> structured result
  -> harness trace
```

## Layer Responsibilities
### Agent Harness
The harness is the agent-facing control layer.

It is responsible for:
- scenario detection
- request planning
- context assembly
- tool priority and routing policy
- fallback and retry logic
- step trace and decision trace

It is not responsible for:
- downloading runtimes
- reading jars directly
- managing package cache internals
- implementing Java or Gradle protocol logic

### MCP Core
The MCP core is the capability layer.

It is responsible for:
- runtime download, verification, and cache
- workspace and environment detection
- adapters for Java, Gradle, jars, ProbeJS, d.ts, datapack, and docs
- package registry and cache handling
- source and docs retrieval
- structured MCP tool outputs

It is not responsible for:
- high-level agent planning
- prompt policy
- deciding which evidence should be injected first under every scenario

## Agent Harness Design
### Scenario Detection
The harness must classify the working situation before selecting tools.

At minimum it must distinguish:
- plain workspace source
- Gradle Java workspace
- modpack workspace
- workspace with only external jars
- KubeJS and ProbeJS workspace
- datapack-focused workspace
- crash-log triage request
- mixed workspace with multiple viable backends

This is the first protection against wasting tokens on source that does not exist.

### Planning Layer
The harness must convert user intent into an execution route.

Examples:
- Java symbol question in a Gradle workspace:
  `workspace source -> JDTLS -> Gradle metadata -> jar source -> docs`
- KubeJS API question:
  `ProbeJS / d.ts -> snippets -> docs -> fallback source search`
- crash analysis:
  `stack trace extraction -> mod and jar identification -> source/jar lookup -> docs lookup -> likely fault report`

The route must be explicit and traceable, not implicit in prompt prose.

### Context Assembly
The harness must decide:
- which source shards to include
- which docs shards to include
- which d.ts or ProbeJS symbols to include
- which registry or package metadata to include

It must also enforce a budget so the system does not waste context on broad low-value injection.

### Tool Guidance
Each tool must have harness-side policy for:
- when it is preferred
- when it is forbidden
- what should be tried after it fails
- whether it is expensive
- whether it is trustworthy enough for direct answer generation

This guidance must live in the system, not in a skill file.

### Recovery
The harness must define fallback paths.

Examples:
- no workspace source: try jar source
- no attached source: try docs or registry metadata
- no Gradle model: try workspace heuristics and cached runtime knowledge
- no ProbeJS cache: try d.ts or snippets

The harness should fail with a clear explanation only after exhausting the allowed route for that scenario.

### Trace
The harness must record:
- selected scenario
- chosen route
- tools invoked
- shards injected
- budget spent
- fallback path used

This trace is required for debugging and later evaluation.

## MCP Core Design
### Runtime Manager
The runtime manager owns:
- download
- checksum verification
- version pinning
- local storage
- invalidation
- cleanup

Managed artifacts include:
- JDK runtime
- JDTLS distribution
- supporting runtime files needed for Gradle or Java workspace access

The runtime manager must expose stable TypeScript APIs, not shell-script-only behavior.

### Workspace Detector
The workspace detector identifies:
- Gradle wrapper and build roots
- source roots and generated source roots
- Prism or modpack layouts when discoverable
- KubeJS and ProbeJS outputs
- datapack roots
- mods and external libraries

It must produce structured signals for the harness instead of forcing the harness to guess from raw files.

### Adapters
The MCP core needs focused adapters:
- `java-jdtls-adapter`
- `gradle-adapter`
- `jar-source-adapter`
- `kubejs-types-adapter`
- `datapack-adapter`
- `docs-retrieval-adapter`
- `package-registry-adapter`

Each adapter should have one clear responsibility and one stable interface.

### Package And Cache Services
This layer owns:
- `mdm-sources` package metadata
- downloaded package assets
- derived local caches
- shard indexes
- invalidation rules

`mdm-sources` stays the formal published source.
Private derived caches stay local.

### Structured Tool Outputs
MCP tools must return structured data that the harness can reason over.

Tool outputs should expose:
- source path and provenance
- confidence or reliability markers where needed
- cost signals
- whether the result came from workspace source, jar source, docs, d.ts, or cache

This is required so the harness can guide the agent without guessing.

## Docs Inject Design
### Retrieval Inputs
The inject pipeline may draw from:
- workspace source shards
- jar source shards
- docs shards
- d.ts shards
- ProbeJS symbol shards
- datapack schema shards
- registry and package metadata shards
- crash stack match shards

### Inject Pipeline
The inject path is:
1. harness asks for candidate evidence
2. MCP core returns structured candidates
3. harness ranks candidates by scenario relevance
4. harness enforces budget
5. harness records why selected shards were included

### Inject Rules
The system must prefer:
- exact source over secondary docs
- exact type surface over prose docs
- small high-confidence shards over broad generic summaries

The system must avoid:
- large markdown dumps
- unranked multi-source paste
- injecting everything "just in case"

## Harness Terminology
Two harnesses are needed, but they are not the same thing.

### Agent Harness
This is the runtime guidance layer.
It is the primary harness for the product.

### Eval Harness
This is the verification layer.
It exists to test whether the agent harness and MCP core behave correctly.

It should evaluate:
- scenario detection
- routing correctness
- fallback correctness
- docs inject quality
- runtime bootstrap stability
- crash triage quality
- token and latency budget behavior

Agent harness comes first.
Eval harness follows it.

## Monorepo Direction
A TypeScript monorepo should separate runtime roles clearly.

Recommended top-level shape:
- `apps/agent-runtime`
- `apps/mcp-server`
- `packages/agent-harness`
- `packages/eval-harness`
- `packages/runtime-manager`
- `packages/workspace-detector`
- `packages/java-jdtls-adapter`
- `packages/gradle-adapter`
- `packages/jar-source-adapter`
- `packages/kubejs-types-adapter`
- `packages/datapack-adapter`
- `packages/docs-retrieval`
- `packages/package-registry`
- `packages/shared-types`

This keeps policy, capability, and testing concerns separate.

## Why Not Go Or Rust
This system is dominated by:
- protocol orchestration
- structured data handling
- tool integration
- LSP and Gradle ecosystem wiring
- runtime and cache policy

Those are control-plane problems.

TypeScript is a better fit because:
- it matches MCP and agent tooling well
- it is easier to keep aligned with tsserver, d.ts, and editor ecosystems
- it is more maintainable for the intended workflow

Performance-sensitive paths should be handled by:
- better caching
- shard-based retrieval
- worker threads
- incremental indexing
- subprocess use where ecosystem tools already exist

This project should optimize architecture first, not switch language for hypothetical speed.

## Non-Goals
- This design does not define every MCP tool signature yet
- it does not define every runtime artifact URL or packaging detail
- it does not replace `mdm-sources` package design
- it does not define the final UI surface of the agent runtime
- it does not make eval harness the first implementation target

## Initial Build Order
The sequence should be:
1. TypeScript monorepo foundation
2. runtime manager
3. workspace detector and adapters
4. MCP core retrieval and package services
5. agent harness
6. docs inject and trace
7. eval harness

This order keeps the real capabilities underneath the harness before the higher-level guidance starts depending on them.

## Risks
- More layers mean more coordination cost
- runtime management increases bootstrap complexity
- harness policy can become opaque if trace quality is poor
- docs inject can still waste context if ranking and budget are weak

These risks are acceptable because the alternative is a tool-only MCP that cannot reliably guide the agent in modding scenarios.

## Final Position
The approved direction is not:
- a pure MCP toolbox
- a skill-dependent system
- a Go-backed performance-first rewrite

It is:
- an all-TypeScript agent runtime
- with a managed Java ecosystem runtime
- with a separate agent harness over MCP core
- with built-in guiding and docs inject
- and with eval harness added after the agent harness exists
