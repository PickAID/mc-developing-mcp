import { describe, expect, it } from "vitest";

import { planSourceAcquisition } from "./source-acquisition-plan.js";

describe("planSourceAcquisition", () => {
  it("keeps source acquisition useful without a workspace", () => {
    const plan = planSourceAcquisition({
      request: {
        purpose: "source_lookup",
        minecraftVersion: "1.21.1",
        loader: "neoforge",
        userJarPaths: ["/packs/libs/example.jar"],
        remoteSources: ["modrinth", "curseforge", "official", "github"]
      },
      workspace: { available: false },
      policies: { remoteDownloads: "confirm", curseforgeCredentials: false }
    });

    expect(plan.requiresWorkspace).toBe(false);
    expect(plan.routes.map((route) => route.origin)).toEqual([
      "runtime_cache",
      "user_jar",
      "official",
      "modrinth",
      "curseforge",
      "github"
    ]);
    expect(plan.routes.find((route) => route.origin === "user_jar")).toMatchObject({
      artifactStrategy: "index_binary_jar",
      privacy: "private_local_cache"
    });
    expect(plan.routes.find((route) => route.origin === "official")).toMatchObject({
      artifactStrategy: "generate_vanilla_source_or_assets",
      requiresUserConsent: true,
      distributionPolicy: "local_generation_only"
    });
    expect(plan.routes.find((route) => route.origin === "curseforge")?.warnings)
      .toContain("curseforge_credentials_required");
  });

  it("prefers workspace gradle and probejs without hiding cache and jar routes", () => {
    const plan = planSourceAcquisition({
      request: {
        purpose: "crash_triage",
        minecraftVersion: "1.20.1",
        loader: "forge",
        localJarPaths: ["/workspace/mods/create.jar"],
        remoteSources: ["modrinth"]
      },
      workspace: {
        available: true,
        hasGradle: true,
        hasProbeJs: true
      },
      policies: { remoteDownloads: "deny", curseforgeCredentials: false }
    });

    expect(plan.requiresWorkspace).toBe(false);
    expect(plan.routes.map((route) => route.origin)).toEqual([
      "workspace_gradle",
      "workspace_probejs",
      "runtime_cache",
      "local_jar",
      "modrinth"
    ]);
    expect(plan.routes[0]).toMatchObject({
      origin: "workspace_gradle",
      artifactStrategy: "read_declared_dependencies",
      cacheMode: "workspace_overlay"
    });
    expect(plan.routes[1]).toMatchObject({
      origin: "workspace_probejs",
      artifactStrategy: "read_probejs_types_and_registries",
      cacheMode: "workspace_overlay"
    });
    expect(plan.routes.find((route) => route.origin === "modrinth")).toMatchObject({
      artifactStrategy: "resolve_remote_jar_metadata",
      requiresUserConsent: true,
      cacheMode: "runtime_metadata_cache"
    });
  });
});
