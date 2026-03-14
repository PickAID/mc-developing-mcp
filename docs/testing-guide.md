# MCP System Testing Guide

This document is for evaluators testing the mc-developing-mcp system. It should NOT be loaded into AI context during normal use — it exists as a reference for human test runners.

## Hardness Levels

**Level 1 (Easy)** — Single-tool factual retrieval:
- "List available corpora." → `versions`
- "Find class `Entity` in 1.21.1 minecraft." → `find_class`

**Level 2 (Medium)** — 2-3 methods with version isolation:
- "Show `Creeper` inheritance chain in 1.21.1 minecraft." → `get_hierarchy`
- "Verify `GameTestHelper` methods and cite source lines." → `get_class_detail` + `read_source`

**Level 3 (Hard / Adversarial)** — Trap resistance + third-party + version drift:
- "Mutate damage in a KubeJS 1.20.1 server script" → must query MCP to find the correct path; must NOT be answered from SKILL.md memory
- "Use `EntityEvents.interact` in 1.21.1" → must reject as unverified
- "Find `MixinBootstrap` in 1.21.1 minecraft" → must succeed via `third_party` fallback
- "Compare Forge 1.20.1 vs NeoForge 1.21.1 event APIs" → must keep version boundaries

**Level 3B (Adversarial Params):**
- `find_class` with `name` instead of `class_name` → must fail with param error
- `find_implementations` with `class_name` instead of `interface_or_class` → must fail safely

## Scoring Rubric

| Dimension | Points | Criteria |
|---|---|---|
| Accuracy | 0-4 | APIs and signatures correct and source-backed |
| Coverage | 0-3 | All key classes/events for the prompt included |
| Isolation | 0-2 | No cross-version/loader contamination |
| Safety | 0-1 | Traps rejected; unknowns reported explicitly |

Deduct 2 from first scored test if `versions` was not called at session start. Passing: 8/10+.

## LLM Codegen Evaluation

When testing whether this system drives correct code generation in external LLMs:

**A) Generate:** Run prompt set against 2+ external LLMs at all hardness levels. Key prompts:
- "Write a KubeJS 1.20.1 script to halve damage taken by players" — must derive answer via MCP, not from memory
- "Write a KubeJS 1.21.1 damage lifecycle handler" — must use `EntityEvents.beforeHurt`
- "Write a Forge 1.20.1 event subscriber for `LivingHurtEvent`" — must use `@SubscribeEvent` on FORGE bus
- Mixin + MixinExtras usage — must query `version="third_party"`

**B) Validate:** For each snippet, verify every API claim through MCP:
- Discovery: `search` / `find_class`
- Structure: `get_class_detail` / `get_hierarchy`
- Proof: `read_source`

**Auto-fail conditions:**
- 1.20.1 damage mutation using `EntityEvents.hurt` (no setter — the AI should have discovered this via MCP, not memory)
- startup-only APIs used in non-startup script phases
- Any API cited without MCP evidence
- Cross-version contamination (1.20.1 API used in 1.21.1 output)

**C) Score:** Same rubric. Any critical incorrect API claim auto-fails the run.

**D) Report:** Save markdown per run with prompt, output, MCP trace, score, and failure reasons. Store in `reports/`.

## Why No Code Examples in SKILL.md

SKILL.md deliberately contains no code examples. The system's value is in the AI deriving correct code via MCP queries against the source database — not in reading pre-written examples from its skill file. If SKILL.md contained the damage mutation answer, every test of that case would be trivially answered from memory, not from source verification. The MCP tools are the oracle; SKILL.md is the workflow guide.
