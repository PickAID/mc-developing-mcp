import type { DocsPackageKind } from "minecraft-developing-mcp-shared-types";

export interface DocsPackageRecord {
  entryId: string;
  packageId: string;
  kind: DocsPackageKind;
  title: string;
  path: string;
  headings: string[];
  summary: string;
  searchTerms: string[];
  scriptScopes: string[];
  addonNames: string[];
  eventNames: string[];
  codeSymbols: string[];
  metadata?: Record<string, unknown>;
}

export const CRYCHICDOC_KUBEJS_1201_RECORDS: DocsPackageRecord[] = [
  {
    entryId: "crychicdoc-kubejs-1.20.1-file-structure",
    packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
    kind: "resource-layout",
    title: "KubeJS File Structure and Script Scope Placement",
    path: "docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/FileStructure.md",
    headings: [
      "assets",
      "data",
      "startup_scripts",
      "server_scripts",
      "client_scripts"
    ],
    summary:
      "Explains where KubeJS scripts and data assets belong, why startup_scripts is for registration, and why assets/data are not the preferred way to override other mods.",
    searchTerms: [
      "startup_scripts",
      "server_scripts",
      "client_scripts",
      "assets",
      "data",
      "hot reload",
      "register content",
      "override other mods"
    ],
    scriptScopes: ["startup_scripts", "server_scripts", "client_scripts"],
    addonNames: [],
    eventNames: [],
    codeSymbols: []
  },
  {
    entryId: "crychicdoc-kubejs-1.20.1-probejs-workflow",
    packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
    kind: "addon-guide",
    title: "ProbeJS Workflow, Type Generation, and TS Server Recovery",
    path: "docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/ProbeJS.md",
    headings: ["ProbeJS", "type generation", "snippets", "tsserver restart"],
    summary:
      "Covers ProbeJS dump commands, generated type and snippet files, version differences, and when the TypeScript server must be restarted in VS Code.",
    searchTerms: [
      "probejs",
      "types",
      "snippets",
      "dump",
      "typescript server",
      "tsserver",
      "autocomplete",
      "jsdoc"
    ],
    scriptScopes: [],
    addonNames: ["probejs"],
    eventNames: [],
    codeSymbols: ["probejs dump"]
  },
  {
    entryId: "crychicdoc-kubejs-1.20.1-event-catalog",
    packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
    kind: "event-catalog",
    title: "KubeJS Event Catalog by Script Scope",
    path: "docs/zh/modpack/kubejs/1.20.1/KubeJSCourse/KubeJSBasic/AllEvent.md",
    headings: ["startup events", "server events", "client events"],
    summary:
      "Maps common KubeJS events to the correct script scope so recipe, loot, player, and block logic land in the right lifecycle location.",
    searchTerms: [
      "event",
      "events",
      "recipe event",
      "loot event",
      "player event",
      "inventory event"
    ],
    scriptScopes: ["startup_scripts", "server_scripts", "client_scripts"],
    addonNames: [],
    eventNames: [
      "serverevents.recipes",
      "itemevents",
      "blockevents",
      "playerevents"
    ],
    codeSymbols: ["ServerEvents.recipes"]
  },
  {
    entryId: "crychicdoc-kubejs-1.20.1-lootjs-guide",
    packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
    kind: "addon-guide",
    title: "LootJS Usage and Drop Modification Guidance",
    path: "docs/zh/modpack/kubejs/1.20.1/Introduction/Addon/LootJs/LootJs.md",
    headings: ["LootJS", "drop modification", "addon guidance"],
    summary:
      "Explains when LootJS should be preferred for loot table changes and highlights version-sensitive usage patterns for drop modification.",
    searchTerms: [
      "lootjs",
      "loot",
      "drops",
      "drop modification",
      "loot table"
    ],
    scriptScopes: ["server_scripts"],
    addonNames: ["lootjs"],
    eventNames: [],
    codeSymbols: []
  }
];

export const BUILTIN_DOCS_RECORDS: DocsPackageRecord[] = [
  ...CRYCHICDOC_KUBEJS_1201_RECORDS
];
