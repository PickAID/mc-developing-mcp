export function buildMcpDevelopToolDescription(): string {
  return [
    "Use before guessing Minecraft modding code, KubeJS scripts, datapack JSON, Gradle dependencies, or modpack crash causes.",
    "This single progressive tool detects the workspace, applies the harness route, and chooses local evidence before optional docs.",
    "It treats KubeJS as Minecraft scripting instead of generic JavaScript, checks ProbeJS/d.ts context when available, and can inspect Gradle files, Java sources, datapack data/assets, logs, and mod JAR contents.",
    "It can cache MDM Release artifacts only when mdmReleaseInstall.downloadPolicy is explicitly allowed; otherwise it returns a confirmation requirement.",
    "For vanilla datapack/resource-pack schema explanation, prefer MDM docs packages generated from SpyglassMC/vanilla-mcdoc and misode/misode.github.io when local evidence is insufficient.",
    "For Minecraft version changes and migration, treat NeoForged primers at https://github.com/neoforged/.github/tree/main/primers and misode version changelogs such as https://misode.github.io/versions/?id=26.1&tab=changelog as authoritative change sources after local workspace evidence.",
    "Remote metadata lookup is conservative by default; enable preparationPolicy.remoteMetadataPolicy only after local evidence is insufficient and remote lookup is allowed.",
    "Progressive route guide: use workspace_gradle for declared dependencies, repositories, and Gradle cache/source archive evidence; use workspace_probejs for KubeJS ProbeJS/d.ts, item, recipe, tag, fluid, and registry evidence; use runtime_cache for offline SQLite/source packages; use local_jar or user_jar for modpack jars, JarJar, classes, assets, data, and owner lookup.",
    "For mod jar class source, prefer source jars and source indexes first; when a decompile request is explicit, class-owner evidence can decompile on demand if MC_DEVELOPING_MCP_VINEFLOWER_JAR or MC_DEVELOPING_MCP_CFR_JAR points to a local decompiler jar.",
    "Use official only after user confirmation for generated vanilla source/assets/datapack evidence. Use modrinth, curseforge, or github only when local evidence is insufficient or external acquisition is requested. Modrinth metadata needs preparationPolicy.remoteMetadataPolicy: enabled; CurseForge metadata needs both preparationPolicy.remoteMetadataPolicy: enabled and CURSEFORGE_API_KEY.",
    "If Gradle dependencies are known but source jars are missing, call again with gradleSourceDiscovery.includeDefaultGradleUserHome: true or ask the user to run Gradle sync. For broad crash triage, call again with preparationPolicy.localJarMode: prewarm_entry_index to build the private jar entry index.",
    "Return value includes a compact text summary plus structured route/evidence data; inspect top-level workspacePreparation, crashSignals, javaDiagnostics, kubeJsQuality, and clientVisualVerifier before drilling into selectedEvidence payloads, and use workspacePreparation.workflow.nextCallPatterns for reusable mc_develop input patches."
  ].join(" ");
}
