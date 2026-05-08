import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readMdmDocsResourceRecords } from "./mdm-resource.js";
import { searchSelectedDocsPackages } from "./search.js";

describe("guidance synthesis", () => {
  it("synthesizes KubeJS guidance sections into searchable records", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-kubejs-guidance-"));
    const artifactPath = join(root, "kubejs-1.20.1-guidance-0.2.0.mdm-resource.json");

    await writeFile(
      artifactPath,
      JSON.stringify(fixtureKubeJsGuidanceArtifact(), null, 2)
    );

    const records = await readMdmDocsResourceRecords(artifactPath);

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: "kubejs-1.20.1-guidance-principles-scope-aware-events",
          title: "Choose events by script scope and loader bridge",
          searchTerms: expect.arrayContaining([
            "forgeevents",
            "nativeevents",
            "loader event"
          ])
        }),
        expect.objectContaining({
          entryId: "kubejs-1.20.1-guidance-scopeRules-server_scripts",
          title: "server_scripts",
          summary: expect.stringContaining("ServerEvents.recipes"),
          scriptScopes: ["server_scripts"]
        }),
        expect.objectContaining({
          entryId: "kubejs-1.20.1-guidance-lookupHints-forgeevents",
          summary: expect.stringContaining("KubeJS in the current loader")
        })
      ])
    );

    const result = searchSelectedDocsPackages({
      queryText: "ForgeEvents NativeEvents global ServerEvents.recipes",
      docsSelection: {
        selections: [],
        trace: {
          registryPackageIds: [],
          taskIntentId: "kubejs_authoring",
          routeStep: "docs_lookup",
          rejectedPackages: []
        }
      },
      resourceRecords: records
    });

    expect(result.hits.map((hit) => hit.entryId)).toEqual(
      expect.arrayContaining([
        "kubejs-1.20.1-guidance-principles-scope-aware-events",
        "kubejs-1.20.1-guidance-scopeRules-server_scripts"
      ])
    );
  });
});

function fixtureKubeJsGuidanceArtifact() {
  return {
    schemaVersion: 1,
    package: {
      identity: {
        packageId: "kubejs-1.20.1-guidance",
        displayName: "KubeJS 1.20.1 Guidance",
        namespace: "kubejs"
      },
      artifact: {
        kind: "docs_bundle",
        format: "json"
      },
      capabilities: ["docs_search", "docs_direct_read", "kubejs_symbol_lookup"]
    },
    payload: {
      "payload/kubejs-guidance.json": {
        repoPath: "packages/kubejs/guidance/1.20.1/payload/kubejs-guidance.json",
        content: JSON.stringify({
          schemaVersion: 1,
          principles: [
            {
              id: "scope-aware-events",
              title: "Choose events by script scope and loader bridge",
              guidance:
                "Use KubeJS events when available, ForgeEvents or NativeEvents when the target behavior is exposed through the loader event bus."
            }
          ],
          scopeRules: [
            {
              scope: "server_scripts",
              purpose: "Handle recipes, tags, loot, commands, and gameplay events.",
              rules: [
                "Prefer ServerEvents.recipes and ServerEvents.tags before dropping to loader-native events."
              ]
            }
          ],
          lookupHints: [
            {
              query: "ForgeEvents",
              use:
                "Check whether the target event is exposed by KubeJS in the current loader before using a native loader event."
            }
          ]
        })
      }
    }
  };
}
