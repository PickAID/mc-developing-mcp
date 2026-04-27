import { describe, expect, it } from "vitest";

import { CRYCHICDOC_KUBEJS_1201_PACKAGE } from "./builtin-packages.js";
import { searchSelectedDocsPackages } from "./search.js";

describe("searchSelectedDocsPackages", () => {
  it("returns structured CrychicDoc hits for startup_scripts and ProbeJS queries", () => {
    const result = searchSelectedDocsPackages({
      queryText:
        "How should I place this startup_scripts recipe and use ProbeJS in 1.20.1?",
      docsSelection: buildSelectedKubejsDocs()
    });

    expect(result.hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: "crychicdoc-kubejs-1.20.1-file-structure",
          packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
          matchedTerms: expect.arrayContaining(["startup_scripts"])
        }),
        expect.objectContaining({
          entryId: "crychicdoc-kubejs-1.20.1-probejs-workflow",
          packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
          matchedTerms: expect.arrayContaining(["probejs"])
        })
      ])
    );
    expect(result.trace).toMatchObject({
      selectedPackageIds: ["crychicdoc-kubejs-1.20.1-course-zh-cn"],
      matchedEntryIds: expect.arrayContaining([
        "crychicdoc-kubejs-1.20.1-file-structure",
        "crychicdoc-kubejs-1.20.1-probejs-workflow"
      ])
    });
  });

  it("returns no hits when no docs packages are selected", () => {
    const result = searchSelectedDocsPackages({
      queryText: "The server crashes on startup and latest.log shows an exception.",
      docsSelection: {
        selections: [],
        trace: {
          registryPackageIds: [
            "crychicdoc-kubejs-1.20.1-course-zh-cn"
          ],
          taskIntentId: "crash_triage",
          routeStep: "docs_lookup",
          rejectedPackages: [
            {
              packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
              reason:
                "task intent crash_triage is outside the package intent scope"
            }
          ]
        }
      }
    });

    expect(result.hits).toEqual([]);
    expect(result.trace).toMatchObject({
      selectedPackageIds: [],
      matchedEntryIds: []
    });
  });
});

function buildSelectedKubejsDocs() {
  return {
    selections: [
      {
        packageId: "crychicdoc-kubejs-1.20.1-course-zh-cn",
        score: 14,
        reasons: [
          "task intent is kubejs_authoring",
          "request text matches strict Minecraft 1.20.1 fence"
        ],
        matchedSignals: ["probejs", "startup_scripts", "recipe"],
        manifest: CRYCHICDOC_KUBEJS_1201_PACKAGE
      }
    ],
    trace: {
      registryPackageIds: ["crychicdoc-kubejs-1.20.1-course-zh-cn"],
      taskIntentId: "kubejs_authoring" as const,
      routeStep: "docs_lookup" as const,
      rejectedPackages: []
    }
  };
}
