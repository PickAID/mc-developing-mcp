import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { createFileMavenMetadataCache } from "@mcpskill/external-mod-resolver";

import { buildMcpServerBootstrap } from "./bootstrap.js";
import { executeMcpServerRequest } from "./request-executor.js";

describe("executeMcpServerRequest external mod routing", () => {
  it("selects external mod resolution through the context.query evidence chain", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime"
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText:
        "Find the Modrinth Maven modImplementation coordinate for Sodium fabric 1.20.1.",
      contextQuery: {
        externalModResolutionExecutor: ({ candidate }) => ({
          matched: true,
          summary: "Resolved maven.modrinth:sodium:OihdIimA.",
          payload: {
            source: "external_mod_resolution",
            candidateId: candidate.id,
            coordinate: "maven.modrinth:sodium:OihdIimA"
          }
        })
      }
    });

    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-1-external_mod_resolution",
      routeStep: "external_mod_resolution",
      preferredTool: "context.query",
      status: "selected",
      payload: {
        source: "external_mod_resolution",
        coordinate: "maven.modrinth:sodium:OihdIimA"
      }
    });
    expect(result.executions).toHaveLength(1);
    expect(result.trace).toMatchObject({
      selectedCandidateId: "candidate-1-external_mod_resolution",
      routeSteps: ["external_mod_resolution", "docs_lookup"],
      failedCandidateIds: []
    });
  });

  it("resolves explicit Maven coordinates through the default evidence chain", async () => {
    const bootstrap = await buildMcpServerBootstrap({
      runtimeRoot: "/tmp/mcpskill-runtime"
    });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText:
        'Use modImplementation "com.example:demo-mod:1.2.3" from https://maven.example/releases.'
    });

    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-1-external_mod_resolution",
      routeStep: "external_mod_resolution",
      status: "selected",
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "maven",
          coordinate: "com.example:demo-mod:1.2.3",
          repositoryUrls: ["https://maven.example/releases"]
        },
        result: {
          source: "maven",
          candidates: [
            {
              fileName: "demo-mod-1.2.3.jar",
              downloadUrl:
                "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3.jar"
            },
            {
              fileName: "demo-mod-1.2.3-sources.jar",
              downloadUrl:
                "https://maven.example/releases/com/example/demo-mod/1.2.3/demo-mod-1.2.3-sources.jar"
            }
          ]
        }
      }
    });
    expect(result.trace).toMatchObject({
      selectedCandidateId: "candidate-1-external_mod_resolution",
      fallbackUsed: false
    });
  });

  it("uses runtime-local Maven metadata cache for omitted coordinate versions", async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-extmod-mcp-"));
    const metadataCache = createFileMavenMetadataCache(runtimeRoot);
    await metadataCache.write(
      new URL(
        "https://maven.example/releases/com/example/demo-mod/maven-metadata.xml"
      ),
      [
        "<metadata>",
        "  <versioning>",
        "    <release>1.2.4</release>",
        "  </versioning>",
        "</metadata>"
      ].join("\n")
    );
    const bootstrap = await buildMcpServerBootstrap({ runtimeRoot });

    const result = await executeMcpServerRequest({
      bootstrap,
      requestText:
        'Use modImplementation "com.example:demo-mod" from https://maven.example/releases.'
    });

    expect(result.selectedEvidence).toMatchObject({
      candidateId: "candidate-1-external_mod_resolution",
      status: "selected",
      payload: {
        source: "external_mod_resolution",
        request: {
          platform: "maven",
          coordinate: "com.example:demo-mod",
          repositoryUrls: ["https://maven.example/releases"]
        },
        result: {
          source: "maven",
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
              fileName: "demo-mod-1.2.4.jar",
              downloadUrl:
                "https://maven.example/releases/com/example/demo-mod/1.2.4/demo-mod-1.2.4.jar"
            },
            {
              fileName: "demo-mod-1.2.4-sources.jar",
              downloadUrl:
                "https://maven.example/releases/com/example/demo-mod/1.2.4/demo-mod-1.2.4-sources.jar"
            }
          ]
        }
      }
    });
  });
});
