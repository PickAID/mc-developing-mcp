import { describe, expect, it } from "vitest";

import { resolveMavenArtifact } from "./maven-repository.js";
import { createMemoryMavenMetadataCache } from "./metadata-cache.js";

describe("resolveMavenArtifact", () => {
  it("builds deterministic binary and sources jar candidates from an exact Gradle coordinate", async () => {
    const result = await resolveMavenArtifact({
      coordinate: 'modImplementation "com.example:demo-mod:1.2.3"',
      repositories: [
        {
          name: "Example Maven",
          url: "https://maven.example/releases"
        }
      ],
      includeSources: true,
      fetch: async () => {
        throw new Error("Exact versions must not fetch maven-metadata.xml.");
      }
    });

    expect(result).toMatchObject({
      source: "maven",
      query: "com.example:demo-mod:1.2.3",
      warnings: [],
      candidates: [
        {
          source: "maven",
          confidence: "high",
          confidenceReasons: [
            "parsed exact Maven coordinate com.example:demo-mod:1.2.3",
            "selected repository Example Maven",
            "built deterministic Maven artifact URL"
          ],
          projectId: "com.example:demo-mod",
          slug: "demo-mod",
          title: "com.example:demo-mod",
          versionId: "1.2.3",
          versionNumber: "1.2.3",
          fileName: "demo-mod-1.2.3.jar",
          downloadUrl:
            "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3.jar",
          mavenArtifacts: [
            {
              source: "maven-repository",
              repositoryName: "Example Maven",
              repositoryUrl: "https://maven.example/releases",
              group: "com.example",
              artifact: "demo-mod",
              version: "1.2.3",
              coordinates: "com.example:demo-mod:1.2.3",
              gradle: {
                loom: {
                  modImplementation:
                    'modImplementation "com.example:demo-mod:1.2.3"'
                },
                forgeGradle: {
                  implementationFgDeobf:
                    'implementation fg.deobf("com.example:demo-mod:1.2.3")'
                }
              }
            }
          ],
          requiresConfirmation: true,
          cachePolicy: "metadata_only"
        },
        {
          fileName: "demo-mod-1.2.3-sources.jar",
          downloadUrl:
            "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3-sources.jar"
        }
      ]
    });
  });

  it("reads maven-metadata.xml when the coordinate omits a version", async () => {
    const requests: string[] = [];
    const result = await resolveMavenArtifact({
      coordinate: "com.example:demo-mod",
      repositories: [
        {
          name: "Example Maven",
          url: "https://maven.example/releases/"
        }
      ],
      fetch: async (url) => {
        requests.push(url.toString());
        return new Response(
          [
            "<metadata>",
            "  <groupId>com.example</groupId>",
            "  <artifactId>demo-mod</artifactId>",
            "  <versioning>",
            "    <latest>1.2.5</latest>",
            "    <release>1.2.4</release>",
            "  </versioning>",
            "</metadata>"
          ].join("\n"),
          {
            status: 200,
            headers: {
              "content-type": "application/xml"
            }
          }
        );
      }
    });

    expect(requests).toEqual([
      "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
    ]);
    expect(result).toMatchObject({
      source: "maven",
      query: "com.example:demo-mod:1.2.4",
      candidates: [
        {
          versionId: "1.2.4",
          versionNumber: "1.2.4",
          fileName: "demo-mod-1.2.4.jar",
          downloadUrl:
            "https://maven.example/releases/com/example/demo-mod/1.2.4/demo-mod-1.2.4.jar",
          confidenceReasons: [
            "resolved Maven version 1.2.4 from maven-metadata.xml",
            "selected repository Example Maven",
            "built deterministic Maven artifact URL"
          ]
        }
      ],
      warnings: []
    });
  });

  it("reuses cached maven-metadata.xml without repeating a remote fetch", async () => {
    const metadataCache = createMemoryMavenMetadataCache();
    let fetchCount = 0;
    const first = await resolveMavenArtifact({
      coordinate: "com.example:demo-mod",
      repositories: [
        {
          name: "Example Maven",
          url: "https://maven.example/releases"
        }
      ],
      metadataCache,
      fetch: async () => {
        fetchCount += 1;
        return new Response(
          "<metadata><versioning><release>1.2.4</release></versioning></metadata>",
          { status: 200 }
        );
      }
    });
    const second = await resolveMavenArtifact({
      coordinate: "com.example:demo-mod",
      repositories: [
        {
          name: "Example Maven",
          url: "https://maven.example/releases"
        }
      ],
      metadataCache,
      fetch: async () => {
        fetchCount += 1;
        throw new Error("Cached metadata should avoid a second fetch.");
      }
    });

    expect(fetchCount).toBe(1);
    expect(first.cacheTrace).toEqual({
      hits: [],
      misses: [
        "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
      ],
      writes: [
        "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
      ]
    });
    expect(second).toMatchObject({
      query: "com.example:demo-mod:1.2.4",
      cacheTrace: {
        hits: [
          "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
        ],
        misses: [],
        writes: []
      },
      candidates: [
        {
          confidenceReasons: [
            "resolved Maven version 1.2.4 from cached maven-metadata.xml",
            "selected repository Example Maven",
            "built deterministic Maven artifact URL"
          ]
        }
      ]
    });
  });
});
