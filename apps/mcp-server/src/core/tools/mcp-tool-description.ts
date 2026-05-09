export function buildMcpDevelopToolDescription(): string {
  return [
    "Use before guessing Minecraft modding code, KubeJS scripts, datapack JSON, Gradle dependencies, or modpack crash causes.",
    "This single progressive tool detects the workspace, applies the harness route, and chooses local evidence before optional docs.",
    "It treats KubeJS as Minecraft scripting instead of generic JavaScript, checks ProbeJS/d.ts context when available, and can inspect Gradle files, Java sources, datapack data/assets, logs, and mod JAR contents.",
    "It can cache MDM Release artifacts only when mdmReleaseInstall.downloadPolicy is explicitly allowed; otherwise it returns a confirmation requirement.",
    "Remote metadata lookup is conservative by default; enable preparationPolicy.remoteMetadataPolicy and provide credentials where needed.",
    "Progressive route guide: use workspace_gradle for declared dependencies, repositories, and Gradle cache/source archive evidence; use workspace_probejs for KubeJS ProbeJS/d.ts, item, recipe, tag, fluid, and registry evidence; use runtime_cache for offline SQLite/source packages; use local_jar or user_jar for modpack jars, JarJar, classes, assets, data, and owner lookup.",
    "Use official only after user confirmation for generated vanilla source/assets/datapack evidence. Use modrinth, curseforge, or github only when local evidence is insufficient or external acquisition is requested; call again with preparationPolicy.remoteMetadataPolicy: enabled and credentials such as CURSEFORGE_API_KEY when needed.",
    "If Gradle dependencies are known but source jars are missing, call again with gradleSourceDiscovery.includeDefaultGradleUserHome: true or ask the user to run Gradle sync. For broad crash triage, call again with preparationPolicy.localJarMode: prewarm_entry_index to build the private jar entry index.",
    "Return value includes a compact text summary plus structured route/evidence data, including workspacePreparation.workflow.nextCallPatterns with reusable mc_develop input patches."
  ].join(" ");
}
