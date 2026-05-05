# Reference MCP Absorption Index

Date: 2026-05-05

## Documents

- Architecture backlog:
  `docs/specs/reference-mcp-architecture-absorption-backlog.md`
- Verification record:
  `docs/reviews/2026-05-05-reference-mcp-absorption-verification.md`

## Current Conclusion

The absorption round is approximately 98% complete. It verified several
TypeScript-only internal capabilities without expanding the minimal public MCP
tool surface: chunked source index reads, docs `matchReasons`, best-effort Java
member lookup with `memberKind` filtering, workspace/Gradle bounded line reads,
mod archive pre-decompile analysis, bounded direct and nested JarJar
`source.read`/`nextReads`, package acquisition evidence, real SQLite MDM docs
artifacts with direct FTS/LIKE query support, privacy-preserving real-workspace
smoke, ProbeJS natural-language symbol extraction, atomic source package install
locks, read-only stale-lock evidence, source job supervision snapshots, source
acquisition runner contract, recoverable queued job request files, direct SQLite
docs lookup routing, mixed docs hit ranking, bounded client visual
missing-evidence wording, UX wording pass, and internal Mixin target/member/AW
verifier-boundary routing.

Do not describe this as complete. Source acquisition job snapshots are now
persisted and source package installs use an atomic per-package lock, but
remaining risk stays in explicit stale-lock recovery policy, durable
long-running worker/daemon execution, consistent `mc_develop` examples, generalized
follow-up read protocols, mapping namespace translation, AW applicability
verification, injection-point validation, and deeper verifier semantics. The current bounded read convention is
`source.read path:start-end` for workspace, Gradle Java source evidence, and
indexed vanilla source evidence. Mod archive Java reads, local datapack/
resource-pack reads, generated vanilla resources, and client visual asset
evidence also support the same shape. Mod archive support includes Java plus
explicit JSON data and text asset ranges, including nested
`embedded.jar!/path:start-end` reads. Explicit follow-up ranges are line-capped
to avoid token-heavy reads.

Architecture facts to preserve:

- Datapack and resource-pack packages are split and treated with equal rigor,
  with version-profile coverage from Minecraft 1.18.2 through future
  pack-format handling.
- Vanilla source is generated only after user confirmation and is not checked
  into the repository.
- `mdm-sources` and `mdm-resources` stay as small curated manifests; private
  local-derived caches and indexes belong to MCP-managed local state.
- SQLite packages are downloaded or generated on demand, not auto-installed at
  startup.
- Mixin verification separates class proof from `memberProofs`; JVM
  descriptors are narrowing evidence, and AW/ClassTweaker data is evidence-only
  with no namespace translation yet.
- KubeJS is not ordinary JavaScript; harness policy and prompt-injection
  handling must treat it as Minecraft lifecycle/data/resource-pack evidence.
- Client visual evidence covers UI, render, shader, assets, and resource-pack
  signals through a retrieval chain, not a single conclusive lookup.
