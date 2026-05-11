import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { executeMcpServerSourceAcquisitionPlan } from "./source-acquisition-plan-executor.js";
import type { McpServerEvidenceExecutorInput } from "../request/execution/request-handler.js";

describe("executeMcpServerSourceAcquisitionPlan workspace execution", () => {
  it("executes Gradle workspace routes with the default workspace handler", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-acq-gradle-"));

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      [
        "repositories {",
        "  mavenCentral()",
        "  maven { url = 'https://maven.neoforged.net/releases' }",
        "}",
        "dependencies {",
        "  modImplementation 'net.neoforged:neoforge:21.1.1'",
        "}"
      ].join("\n")
    );
    await mkdir(
      join(
        workspaceRoot,
        ".gradle",
        "caches",
        "modules-2",
        "files-2.1",
        "net.neoforged",
        "neoforge",
        "21.1.1",
        "abc"
      ),
      { recursive: true }
    );
    await writeFile(
      join(
        workspaceRoot,
        ".gradle",
        "caches",
        "modules-2",
        "files-2.1",
        "net.neoforged",
        "neoforge",
        "21.1.1",
        "abc",
        "neoforge-21.1.1-sources.jar"
      ),
      "source jar placeholder"
    );
    await writeFile(
      join(
        workspaceRoot,
        ".gradle",
        "caches",
        "modules-2",
        "files-2.1",
        "net.neoforged",
        "neoforge",
        "21.1.1",
        "abc",
        "neoforge-21.1.1.jar"
      ),
      "binary jar placeholder"
    );

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot, {
        serviceProfile:
          "Gradle: ready, source archives=1, declared source archives=1, binary archives=1"
      })
    );
    const payload = result.payload as {
      routes: unknown[];
      workItems: unknown[];
      workItemExecutions: Array<{
        kind: string;
        status: string;
        payload?: unknown;
      }>;
    };

    expect(result).toMatchObject({
      matched: true,
      payload: {
        source: "source_acquisition_plan",
        capabilityGuidance: expect.objectContaining({
          capabilityMap: expect.objectContaining({
            mode: "progressive_discovery",
            routeCapabilities: expect.arrayContaining([
              expect.objectContaining({
                origin: "workspace_gradle",
                status: "ready",
                artifactStrategy: "read_declared_dependencies",
                sourceLookup: expect.objectContaining({
                  sourceArchiveCount: 1,
                  declaredDependencySourceArchiveCount: 1,
                  declaredDependencyBinaryArchiveCount: 1,
                  supportsDirectSourceRead: true,
                  supportsBinaryOwnerLookup: true,
                  status: "ready"
                })
              })
            ])
          })
        })
      }
    });
    expect(payload.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: "workspace_gradle",
          artifactStrategy: "read_declared_dependencies"
        })
      ])
    );
    expect(payload.workItems).toEqual(
      expect.arrayContaining([
        {
          kind: "workspace_gradle_dependencies",
          workspaceRoot,
          cacheScope: "workspace_overlay"
        }
      ])
    );
    expect(payload.workItemExecutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workspace_gradle_dependencies",
          status: "completed",
          payload: expect.objectContaining({
            source: "workspace_gradle",
            workspaceRoot,
            dependencyCount: 1,
            repositoryCount: 2,
            dependencies: [
              {
                group: "net.neoforged",
                artifact: "neoforge",
                version: "21.1.1",
                notation: "net.neoforged:neoforge:21.1.1",
                sourceFile: "build.gradle"
              }
            ],
            declaredDependencySourceArchiveCount: 1,
            declaredDependencyBinaryArchiveCount: 1,
            declaredDependencySourceArchives: [
              expect.objectContaining({
                archivePath: expect.stringContaining(
                  "neoforge-21.1.1-sources.jar"
                )
              })
            ],
            declaredDependencyBinaryArchives: [
              expect.objectContaining({
                archivePath: expect.stringContaining("neoforge-21.1.1.jar")
              })
            ]
          })
        })
      ])
    );
  });

  it("reports Gradle cache source archives even when templated build files hide coordinates", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-acq-gradle-template-"));

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      [
        "plugins { id 'java' }",
        "dependencies {",
        "  implementation \"${config.mod_group}:${config.mod_id}:${config.mod_version}\"",
        "}"
      ].join("\n")
    );
    await mkdir(
      join(
        workspaceRoot,
        ".gradle",
        "caches",
        "modules-2",
        "files-2.1",
        "com.mihono.pickaid",
        "piserializekit",
        "0.0.7",
        "abc"
      ),
      { recursive: true }
    );
    await writeFile(
      join(
        workspaceRoot,
        ".gradle",
        "caches",
        "modules-2",
        "files-2.1",
        "com.mihono.pickaid",
        "piserializekit",
        "0.0.7",
        "abc",
        "piserializekit-0.0.7-sources.jar"
      ),
      "source jar placeholder"
    );
    await writeFile(
      join(
        workspaceRoot,
        ".gradle",
        "caches",
        "modules-2",
        "files-2.1",
        "com.mihono.pickaid",
        "piserializekit",
        "0.0.7",
        "abc",
        "piserializekit-0.0.7.jar"
      ),
      "binary jar placeholder"
    );

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot, {
        serviceProfile:
          "Gradle: ready, source archives=1, declared source archives=0, declared binary archives=0, gradle cache source archives=1, gradle cache binary archives=1"
      })
    );
    const payload = result.payload as {
      workItemExecutions: Array<{
        kind: string;
        status: string;
        payload?: unknown;
      }>;
    };

    expect(payload.workItemExecutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workspace_gradle_dependencies",
          status: "completed",
          payload: expect.objectContaining({
            source: "workspace_gradle",
            dependencyCount: 0,
            gradleCacheSourceArchiveCount: 1,
            gradleCacheBinaryArchiveCount: 1,
            gradleCacheSourceArchives: [
              expect.objectContaining({
                archivePath: expect.stringContaining(
                  "piserializekit-0.0.7-sources.jar"
                ),
                source: "gradle-cache",
                reason: "workspace-local Gradle module cache"
              })
            ],
            gradleCacheBinaryArchives: [
              expect.objectContaining({
                archivePath: expect.stringContaining("piserializekit-0.0.7.jar"),
                source: "gradle-cache"
              })
            ]
          })
        })
      ])
    );
    expect(
      payload.capabilityGuidance.capabilityMap.routeCapabilities.find(
        (route) => route.origin === "workspace_gradle"
      )?.sourceLookup
    ).toMatchObject({
      gradleCacheSourceArchiveCount: 1,
      gradleCacheBinaryArchiveCount: 1,
      supportsDirectSourceRead: true,
      supportsBinaryOwnerLookup: true,
      status: "ready"
    });
  });

  it("uses configured Gradle user home for source acquisition cache scans", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-acq-gradle-userhome-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-userhome-"));

    await writeFile(join(workspaceRoot, "build.gradle"), "plugins { id 'java' }\n");
    await writeFile(
      join(workspaceRoot, "gradle.properties"),
      "note = no concrete dependency coordinates here\n"
    );
    await mkdir(
      join(
        gradleUserHome,
        "caches",
        "modules-2",
        "files-2.1",
        "com.example",
        "example-lib",
        "1.0.0",
        "abc"
      ),
      { recursive: true }
    );
    await writeFile(
      join(
        gradleUserHome,
        "caches",
        "modules-2",
        "files-2.1",
        "com.example",
        "example-lib",
        "1.0.0",
        "abc",
        "example-lib-1.0.0-sources.jar"
      ),
      "source jar placeholder"
    );
    await writeFile(
      join(
        gradleUserHome,
        "caches",
        "modules-2",
        "files-2.1",
        "com.example",
        "example-lib",
        "1.0.0",
        "abc",
        "example-lib-1.0.0-slim.jar"
      ),
      "slim jar placeholder"
    );

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot, {
        requestText: "Need Gradle cache evidence for piserializekit slim jar."
      }),
      {
        gradleSourceDiscovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      }
    );
    const payload = result.payload as {
      workItemExecutions: Array<{
        kind: string;
        status: string;
        payload?: unknown;
      }>;
    };

    expect(payload.workItemExecutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workspace_gradle_dependencies",
          status: "completed",
          payload: expect.objectContaining({
            gradleCacheSourceArchiveCount: 1,
            gradleCacheBinaryArchiveCount: 1,
            gradleCacheSourceArchives: [
              expect.objectContaining({
                archivePath: expect.stringContaining("example-lib-1.0.0-sources.jar"),
                reason: "configured Gradle user home module cache"
              })
            ],
            gradleCacheBinaryArchives: [
              expect.objectContaining({
                archivePath: expect.stringContaining("example-lib-1.0.0-slim.jar"),
                reason: "configured Gradle user home module cache"
              })
            ]
          })
        })
      ])
    );
  });

  it("ranks requested Gradle cache binary jars before unrelated cache jars", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-acq-gradle-rank-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-rank-home-"));
    const unrelatedJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "aaa.example",
      "unused",
      "1.0.0",
      "hash",
      "unused-1.0.0.jar"
    );
    const requestedJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "com.mihono.pickaid",
      "piserializekit",
      "0.0.7",
      "hash",
      "piserializekit-0.0.7-slim.jar"
    );

    await writeFile(join(workspaceRoot, "build.gradle"), "plugins { id 'java' }\n");
    await mkdir(join(unrelatedJar, ".."), { recursive: true });
    await mkdir(join(requestedJar, ".."), { recursive: true });
    await writeFile(unrelatedJar, "unrelated jar placeholder");
    await writeFile(requestedJar, "requested slim jar placeholder");

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot, {
        requestText: "Find piserializekit slim jar from Gradle cache."
      }),
      {
        gradleSourceDiscovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      }
    );
    const payload = result.payload as {
      workItemExecutions: Array<{
        payload?: {
          gradleCacheBinaryArchives?: Array<{ archivePath: string }>;
        };
      }>;
    };
    const gradleExecution = payload.workItemExecutions.find(
      (execution) => execution.payload?.gradleCacheBinaryArchives
    );

    expect(gradleExecution?.payload?.gradleCacheBinaryArchives?.[0]).toEqual(
      expect.objectContaining({
        archivePath: requestedJar
      })
    );
  });

  it("finds requested Gradle cache source jars beyond the first broad scan page", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-acq-gradle-source-rank-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-source-rank-home-"));
    await writeFile(join(workspaceRoot, "build.gradle"), "plugins { id 'java' }\n");

    for (let index = 0; index < 240; index++) {
      const archive = join(
        gradleUserHome,
        "caches",
        "modules-2",
        "files-2.1",
        "aaa.example",
        `unused-${String(index).padStart(3, "0")}`,
        "1.0.0",
        "hash",
        `unused-${String(index).padStart(3, "0")}-1.0.0-sources.jar`
      );
      await mkdir(join(archive, ".."), { recursive: true });
      await writeFile(archive, "unrelated source jar placeholder");
    }

    const requestedSourceJar = join(
      gradleUserHome,
      "caches",
      "modules-2",
      "files-2.1",
      "net.minecraftforge",
      "fmlloader",
      "1.20.1-47.4.10",
      "hash",
      "fmlloader-1.20.1-47.4.10-sources.jar"
    );
    await mkdir(join(requestedSourceJar, ".."), { recursive: true });
    await writeFile(requestedSourceJar, "requested FMLLoader source jar placeholder");

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot, {
        requestText: "Read FMLLoader source from Gradle cache."
      }),
      {
        gradleSourceDiscovery: {
          gradleUserHome,
          includeDefaultGradleUserHome: false
        }
      }
    );
    const payload = result.payload as {
      workItemExecutions: Array<{
        payload?: {
          gradleCacheSourceArchives?: Array<{ archivePath: string }>;
        };
      }>;
    };
    const gradleExecution = payload.workItemExecutions.find(
      (execution) => execution.payload?.gradleCacheSourceArchives
    );

    expect(gradleExecution?.payload?.gradleCacheSourceArchives?.[0]).toEqual(
      expect.objectContaining({
        archivePath: requestedSourceJar
      })
    );
  });

  it("executes ProbeJS workspace routes with the default workspace handler", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-acq-probe-"));

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      "plugins { id 'dev.latvian.mods.kubejs' }\n"
    );
    await mkdir(join(workspaceRoot, "kubejs", "probejs", "items"), {
      recursive: true
    });
    await writeFile(
      join(workspaceRoot, "kubejs", "probejs", "items", "minecraft.txt"),
      "minecraft:stone\nminecraft:dirt\n"
    );

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot, {
        hasKubeJS: true,
        hasProbeJS: true,
        requestText: "KubeJS list item registry minecraft:stone"
      })
    );
    const payload = result.payload as {
      workItems: unknown[];
      workItemExecutions: Array<{
        kind: string;
        status: string;
        payload?: unknown;
      }>;
    };

    expect(payload.workItems).toEqual(
      expect.arrayContaining([
        {
          kind: "workspace_probejs_types",
          workspaceRoot,
          cacheScope: "workspace_overlay"
        }
      ])
    );
    expect(payload.workItemExecutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "workspace_probejs_types",
          status: "completed",
          payload: expect.objectContaining({
            source: "probejs_resources",
            queryMode: "resource_summary"
          })
        })
      ])
    );
  });

  it("filters routes when explicit preparation origins are provided", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-source-acq-routes-"));

    await mkdir(join(workspaceRoot, "mods"), { recursive: true });
    await writeFile(join(workspaceRoot, "mods", "demo.jar"), "not a real jar");
    await writeFile(join(workspaceRoot, "build.gradle"), "plugins { id 'java' }\n");

    const result = await executeMcpServerSourceAcquisitionPlan(
      inputFixture(workspaceRoot, {
        requestText: "Prepare only runtime cache and Modrinth routes."
      }),
      {
        routeOrigins: ["runtime_cache", "modrinth"]
      }
    );
    const payload = result.payload as {
      routes: Array<{ origin: string }>;
      capabilityGuidance: {
        capabilityMap: {
          routeCapabilities: Array<{ origin: string }>;
        };
      };
    };

    expect(payload.routes.map((route) => route.origin)).toEqual([
      "runtime_cache",
      "modrinth"
    ]);
    expect(
      payload.capabilityGuidance.capabilityMap.routeCapabilities.map(
        (route) => route.origin
      )
    ).toEqual(["runtime_cache", "modrinth"]);
  });
});

function inputFixture(
  workspaceRoot: string,
  input: {
    hasKubeJS?: boolean;
    hasProbeJS?: boolean;
    requestText?: string;
    serviceProfile?: string;
  } = {}
): McpServerEvidenceExecutorInput {
  const requestText =
    input.requestText ?? "Need workspace Gradle dependency source evidence.";

  return {
    candidate: {
      id: "candidate-source-acquisition",
      priority: 1,
      tier: "primary",
      routeStep: "source_acquisition_plan",
      provenance: "source_acquisition",
      preferredTool: "context.query",
      estimatedCost: "low",
      reliability: "high",
      reason: "Plan source acquisition.",
      pathHints: [],
      queryHint: requestText
    },
    evidencePlan: {
      appId: "mcp-server",
      requestPlan: requestPlanFixture(workspaceRoot, input),
      candidates: [],
      trace: {
        routeSteps: ["source_acquisition_plan"],
        candidateIds: [],
        fallbackCandidateIds: []
      }
    },
    requestPlan: requestPlanFixture(workspaceRoot, input)
  };
}

function requestPlanFixture(
  workspaceRoot: string,
  input: {
    hasKubeJS?: boolean;
    hasProbeJS?: boolean;
    requestText?: string;
    serviceProfile?: string;
  } = {}
): McpServerEvidenceExecutorInput["requestPlan"] {
  const requestText =
    input.requestText ?? "Need workspace Gradle dependency source evidence.";

  return {
    appId: "mcp-server",
    requestText,
    requestContext: {
      workspaceContext: {
        workspaceRoot,
        detectorPackage: "minecraft-developing-mcp-workspace-detector",
        descriptor: {
          root: workspaceRoot,
          kind: "java-mod",
          hasGradle: true,
          hasKubeJS: input.hasKubeJS ?? false,
          hasProbeJS: input.hasProbeJS ?? false,
          hasModArchives: false,
          hasJavaSource: false,
          hasDatapack: false,
          buildFiles: [join(workspaceRoot, "build.gradle")],
          javaSourceRoots: [],
          modArchivePaths: [],
          datapackRoots: [],
          logPaths: [],
          reasons: ["fixture"],
          currentRuntime: {
            minecraftVersion: "1.21.1",
            loader: "neoforge",
            source: "workspace-detect",
            confidence: "high",
            evidenceSources: ["fixture"],
            candidates: [],
            evidence: []
          }
        }
      },
      taskBrief: input.serviceProfile
        ? {
            promptFragments: [
              {
                id: "service_profile",
                text: input.serviceProfile
              }
            ]
          }
        : undefined
    },
    toolGuidance: {
      availableTools: ["context.query"],
      preferredTools: ["context.query"],
      routeSteps: ["source_acquisition_plan"]
    },
    trace: {
      bootstrapKind: "mcp-server"
    }
  };
}
