import type { DocsPackageManifest } from "minecraft-developing-mcp-shared-types";

export const CRYCHICDOC_KUBEJS_1201_PACKAGE: DocsPackageManifest = {
  packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
  origin: "crychicdoc",
  title: "CrychicDoc KubeJS 1.20.1",
  language: "zh-CN",
  domain: "kubejs",
  summary:
    "Structured KubeJS 1.20.1 course and reference content covering script folders, ProbeJS, events, recipes, loot, addons, and upgrade notes.",
  minecraftVersions: ["1.20.1"],
  preferredIntents: ["kubejs_authoring"],
  kinds: [
    "course",
    "concept",
    "event-catalog",
    "addon-guide",
    "resource-layout",
    "upgrade-note"
  ],
  topics: [
    "probejs",
    "startup_scripts",
    "server_scripts",
    "client_scripts",
    "recipe",
    "lootjs",
    "events"
  ],
  querySignals: {
    queryTerms: [
      "probejs",
      "startup_scripts",
      "server_scripts",
      "client_scripts",
      "recipe",
      "recipes",
      "event",
      "events",
      "tag",
      "loot",
      "lootjs",
      "worldgen"
    ],
    addonNames: ["probejs", "lootjs", "morejs", "ponderjs", "entityjs"],
    scriptScopes: ["startup_scripts", "server_scripts", "client_scripts"],
    eventNames: [
      "serverevents.recipes",
      "itemevents",
      "blockevents",
      "playerevents"
    ]
  },
  versionFence: {
    minecraftVersions: ["1.20.1"],
    strict: true
  }
};

export const MINECRAFT_VERSION_CHANGES_PACKAGE: DocsPackageManifest = {
  packageId: "minecraft-version-changes",
  origin: "mdm",
  title: "Minecraft Version Changes",
  language: "en",
  domain: "migration",
  summary:
    "Version-change and migration notes sourced from NeoForged primers and misode technical changes.",
  minecraftVersions: ["26.1"],
  preferredIntents: ["version_change_research"],
  kinds: ["upgrade-note", "migration-map", "format-reference"],
  topics: [
    "version changes",
    "migration",
    "neoforged primers",
    "misode technical changes"
  ],
  querySignals: {
    queryTerms: [
      "version changes",
      "technical changes",
      "changelog",
      "change log",
      "migration",
      "upgrade",
      "porting",
      "primer",
      "primers"
    ],
    addonNames: [],
    scriptScopes: [],
    eventNames: [],
    resourceFormats: [
      "datapack",
      "resourcepack",
      "pack_format",
      "data format",
      "resource format"
    ],
    apiSymbols: [
      "https://github.com/neoforged/.github/tree/main/primers",
      "https://github.com/misode/technical-changes/tree/main/26.1",
      "misode/technical-changes"
    ],
    migrationTerms: [
      "neoforged primers",
      "neoforge primers",
      "misode changelog",
      "misode version changelog",
      "https://github.com/neoforged/.github/tree/main/primers",
      "https://github.com/misode/technical-changes/tree/main/26.1",
      "https://misode.github.io/versions/?id=26.1&tab=changelog"
    ]
  },
  versionFence: {
    minecraftVersions: ["26.1"],
    strict: false
  }
};

export const BUILTIN_DOCS_PACKAGES: DocsPackageManifest[] = [
  CRYCHICDOC_KUBEJS_1201_PACKAGE,
  MINECRAFT_VERSION_CHANGES_PACKAGE
];
