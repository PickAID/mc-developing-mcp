export const CLIENT_VISUAL_CAPABILITY_POLICY_TEXT = [
  "Client visual policy: translate low-knowledge visual requests into concrete Minecraft implementation chains.",
  "Verify registry id -> client init/renderer or screen binding -> blockstate/model/texture or atlas evidence before docs.",
  "For complex models, separate static JSON assets from runtime renderer or model-loader behavior; do not collapse moving parts into blockstate explosion.",
  "For dynamic textures, animated materials, glow, rotation, previews, or mechanical visuals, require lifecycle/cache/reload evidence and avoid per-frame file IO, JSON parsing, registration, or texture allocation.",
  "For rendered mutable state, require a server-authoritative state source plus client sync/interpolation boundary; do not let screen or renderer mutate authoritative state directly.",
  "For KubeJS client visual work, treat client_scripts as the client surface, keep startup/server scopes separate, and prefer ProbeJS/d.ts evidence over generic JavaScript patterns.",
  "Verify loader/version-specific renderer, screen, model-layer, texture, and resource-reload APIs before naming methods or events; report missing API proof instead of mixing Forge, NeoForge, Fabric, or KubeJS patterns.",
  "If any link is missing, report the missing registry, client binding, renderer/screen, sync, reload, or asset evidence instead of inventing generic code."
].join(" ");
