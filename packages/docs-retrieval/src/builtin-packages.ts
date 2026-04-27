import type { DocsPackageManifest } from "@mcpskill/shared-types";

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

export const BUILTIN_DOCS_PACKAGES: DocsPackageManifest[] = [
  CRYCHICDOC_KUBEJS_1201_PACKAGE
];
