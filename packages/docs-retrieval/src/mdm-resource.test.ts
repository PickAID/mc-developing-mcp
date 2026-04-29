import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readMdmDocsResourceRecords } from "./mdm-resource.js";
import { searchSelectedDocsPackages } from "./search.js";

describe("MDM docs resource records", () => {
  it("reads structured docs records from a cached MDM resource artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "mcpskill-mdm-docs-"));
    const artifactPath = join(root, "core-docs-required-0.1.0.mdm-resource.json");

    await writeFile(artifactPath, JSON.stringify(fixtureArtifact(), null, 2));

    await expect(readMdmDocsResourceRecords(artifactPath)).resolves.toEqual([
      expect.objectContaining({
        entryId: "offline-resource-status",
        packageId: "core-docs-required",
        kind: "concept",
        title: "Offline Resource Status",
        path: "packages/core/docs/required/payload/core-docs.json#offline-resource-status",
        summary:
          "Missing optional packages are degraded capability, not fatal failure.",
        searchTerms: expect.arrayContaining([
          "offline-resource-status",
          "Offline Resource Status",
          "Missing optional packages are degraded capability, not fatal failure."
        ])
      })
    ]);
  });

  it("searches resource records even when no builtin docs package was selected", async () => {
    const result = searchSelectedDocsPackages({
      queryText: "Explain offline resource status.",
      docsSelection: {
        selections: [],
        trace: {
          registryPackageIds: [],
          taskIntentId: "workspace_default",
          routeStep: "docs_lookup",
          rejectedPackages: []
        }
      },
      resourceRecords: [
        {
          entryId: "offline-resource-status",
          packageId: "core-docs-required",
          kind: "concept",
          title: "Offline Resource Status",
          path: "packages/core/docs/required/payload/core-docs.json#offline-resource-status",
          headings: [],
          summary:
            "Missing optional packages are degraded capability, not fatal failure.",
          searchTerms: [
            "offline-resource-status",
            "offline resource status",
            "degraded capability"
          ],
          scriptScopes: [],
          addonNames: [],
          eventNames: [],
          codeSymbols: []
        }
      ]
    });

    expect(result.hits).toEqual([
      expect.objectContaining({
        entryId: "offline-resource-status",
        packageId: "core-docs-required",
        matchedTerms: expect.arrayContaining(["offline resource status"])
      })
    ]);
    expect(result.trace).toMatchObject({
      selectedPackageIds: [],
      resourceEntryIds: ["offline-resource-status"],
      matchedEntryIds: ["offline-resource-status"]
    });
  });
});

function fixtureArtifact() {
  return {
    schemaVersion: 1,
    package: {
      id: "core-docs-required",
      artifactType: "docs"
    },
    payload: {
      "core-docs.json": {
        repoPath: "packages/core/docs/required/payload/core-docs.json",
        content: JSON.stringify({
          schemaVersion: 1,
          entries: [
            {
              id: "offline-resource-status",
              title: "Offline Resource Status",
              summary:
                "Missing optional packages are degraded capability, not fatal failure."
            }
          ]
        })
      }
    }
  };
}
