import { describe, expect, it } from "vitest";

import { buildSourceAcquisitionWorkItems } from "./source-acquisition-hand-off.js";
import type { SourceAcquisitionRoute } from "./source-acquisition-plan.js";

describe("buildSourceAcquisitionWorkItems", () => {
  it("turns a user jar route into per-archive jar index work items", () => {
    const workItems = buildSourceAcquisitionWorkItems({
      route: routeFixture({
        origin: "user_jar",
        artifactStrategy: "index_binary_jar",
        cacheMode: "runtime_artifact_cache"
      }),
      paths: ["/packs/libs/example.jar"]
    });

    expect(workItems).toEqual([
      {
        kind: "jar_index",
        sourceArchive: "/packs/libs/example.jar",
        cacheScope: "private_runtime"
      }
    ]);
  });

  it("turns a local jar route into one workspace-level jar index work item", () => {
    const workItems = buildSourceAcquisitionWorkItems({
      route: routeFixture({
        origin: "local_jar",
        artifactStrategy: "index_binary_jar",
        cacheMode: "runtime_artifact_cache"
      }),
      paths: ["/packs/mods/a.jar", "/packs/mods/b.jar"],
      workspaceRoot: "/packs"
    });

    expect(workItems).toEqual([
      {
        kind: "jar_index",
        workspaceRoot: "/packs",
        cacheScope: "private_runtime"
      }
    ]);
  });

  it("turns official routes into vanilla generation work items", () => {
    const workItems = buildSourceAcquisitionWorkItems({
      route: routeFixture({
        origin: "official",
        artifactStrategy: "generate_vanilla_source_or_assets",
        cacheMode: "runtime_artifact_cache"
      }),
      minecraftVersion: "1.21.1"
    });

    expect(workItems).toEqual([
      {
        kind: "vanilla_generation",
        minecraftVersion: "1.21.1",
        cacheScope: "private_runtime"
      }
    ]);
  });

  it("turns remote routes into metadata work items", () => {
    const workItems = ["modrinth", "curseforge", "github"].flatMap((origin) =>
      buildSourceAcquisitionWorkItems({
        route: routeFixture({
          origin: origin as "modrinth" | "curseforge" | "github",
          artifactStrategy:
            origin === "github"
              ? "resolve_remote_source_repository"
              : "resolve_remote_jar_metadata",
          cacheMode: "runtime_metadata_cache"
        })
      })
    );

    expect(workItems).toEqual([
      { kind: "remote_metadata", source: "modrinth", cacheScope: "metadata" },
      { kind: "remote_metadata", source: "curseforge", cacheScope: "metadata" },
      { kind: "remote_metadata", source: "github", cacheScope: "metadata" }
    ]);
  });

  it("turns workspace routes into workspace overlay work items", () => {
    const workspaceRoot = "/packs/dev-workspace";

    expect(
      buildSourceAcquisitionWorkItems({
        route: routeFixture({
          origin: "workspace_gradle",
          artifactStrategy: "read_declared_dependencies",
          cacheMode: "workspace_overlay"
        }),
        workspaceRoot
      })
    ).toEqual([
      {
        kind: "workspace_gradle_dependencies",
        workspaceRoot,
        cacheScope: "workspace_overlay"
      }
    ]);
    expect(
      buildSourceAcquisitionWorkItems({
        route: routeFixture({
          origin: "workspace_probejs",
          artifactStrategy: "read_probejs_types_and_registries",
          cacheMode: "workspace_overlay"
        }),
        workspaceRoot
      })
    ).toEqual([
      {
        kind: "workspace_probejs_types",
        workspaceRoot,
        cacheScope: "workspace_overlay"
      }
    ]);
  });

  it("does not produce impossible work items without required inputs", () => {
    expect(
      buildSourceAcquisitionWorkItems({
        route: routeFixture({
          origin: "local_jar",
          artifactStrategy: "index_binary_jar",
          cacheMode: "runtime_artifact_cache"
        })
      })
    ).toEqual([]);
    expect(
      buildSourceAcquisitionWorkItems({
        route: routeFixture({
          origin: "official",
          artifactStrategy: "generate_vanilla_source_or_assets",
          cacheMode: "runtime_artifact_cache"
        })
      })
    ).toEqual([]);
    expect(
      buildSourceAcquisitionWorkItems({
        route: routeFixture({
          origin: "workspace_gradle",
          artifactStrategy: "read_declared_dependencies",
          cacheMode: "workspace_overlay"
        })
      })
    ).toEqual([]);
    expect(
      buildSourceAcquisitionWorkItems({
        route: routeFixture({
          origin: "workspace_probejs",
          artifactStrategy: "read_probejs_types_and_registries",
          cacheMode: "workspace_overlay"
        })
      })
    ).toEqual([]);
  });
});

function routeFixture(
  input: Pick<
    SourceAcquisitionRoute,
    "origin" | "artifactStrategy" | "cacheMode"
  >
): SourceAcquisitionRoute {
  return {
    ...input,
    priority: 1,
    privacy: "private_local_cache",
    requiresWorkspace: false,
    requiresUserConsent: false,
    distributionPolicy: "private_cache_only",
    warnings: []
  };
}
