export const KUBEJS_NATIVE_EVENT_POLICY =
  " verify ForgeEvents/NativeEvents against runtime and ProbeJS: core KubeJS 1.20.1 ForgeEvents is startup_scripts-only; NativeEvents needs EventJS on 1.20.1 or core KubeJS 1.21.1+; never move native event handlers across scopes without evidence,";

export const KUBEJS_GLOBAL_STATE_POLICY =
  " treat global/Global usage as shared KubeJS state requiring existing-script ownership evidence, named keys/functions, and explicit lifecycle boundaries; avoid hidden mutable globals,";

export const KUBEJS_SCOPE_POLICY_TEXT =
  "Scope: treat KubeJS as Minecraft lifecycle scripting, not a generic JS project; keep startup_scripts, server_scripts, client_scripts, and config responsibilities separate; do not add imports, exports, bundler patterns, or broad const sprawl without workspace precedent.";

export const KUBEJS_EVIDENCE_POLICY_TEXT =
  "Evidence: prefer ProbeJS/d.ts quick info, snippets, item/fluid/tag/registry/recipe summaries, existing scripts, datapack/resource-pack files, and mod archive IDs before generic JavaScript or memory-based API guesses.";

export const KUBEJS_EVENT_POLICY_TEXT =
  "Events: verify ForgeEvents, NativeEvents, StartupEvents, ServerEvents, ClientEvents, and addon-provided globals against runtime/addons before moving handlers across scopes.";

export const KUBEJS_STATE_POLICY_TEXT =
  "State: treat global/Global as shared lifecycle state requiring existing-script ownership evidence, named keys/functions, and explicit initialization/read/write boundaries.";

export const KUBEJS_DEBUG_POLICY_TEXT =
  "Debug: avoid persistent console.* output in committed scripts; if diagnostics are needed, gate them behind an explicit debug flag and remove or document the cleanup path.";

export const KUBEJS_RESOURCE_POLICY_TEXT =
  "Resources: connect scripts to datapack and resource-pack evidence for generated recipes, tags, loot, assets, models, lang keys, textures, and custom registries; report unresolved IDs instead of inventing them.";

export const KUBEJS_FTB_INTEGRATION_POLICY_TEXT =
  "FTB integrations: for FTB XMod Compat or FTB Quests integration, inspect mod archive/decompiled evidence and quest data formats before writing compatibility KubeJS; treat quest files, rewards, tasks, events, and addon bridge behavior as runtime data that must be proven from the pack.";

export const KUBEJS_MIGRATION_POLICY_TEXT =
  "Migration: for version changes, compare runtime, ProbeJS surface, docs, datapack/resource-pack profiles, NeoForged primers, misode version changelogs, and existing scripts before prescribing API/event renames.";

export const KUBEJS_SCRIPTING_POLICY_TEXT = [
  "KubeJS policy:",
  KUBEJS_SCOPE_POLICY_TEXT,
  KUBEJS_EVIDENCE_POLICY_TEXT,
  KUBEJS_EVENT_POLICY_TEXT,
  KUBEJS_STATE_POLICY_TEXT,
  KUBEJS_DEBUG_POLICY_TEXT,
  KUBEJS_RESOURCE_POLICY_TEXT,
  KUBEJS_FTB_INTEGRATION_POLICY_TEXT,
  KUBEJS_MIGRATION_POLICY_TEXT
].join(" ");
