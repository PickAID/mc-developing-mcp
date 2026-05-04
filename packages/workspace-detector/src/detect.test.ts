import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { detectWorkspace } from "./detect.js";

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("detectWorkspace", () => {
  it("rejects an empty root instead of silently resolving the current directory", async () => {
    await expect(detectWorkspace("")).rejects.toThrow("root must not be empty");
  });

  it("detects high-confidence forge runtime from gradle and mods metadata", async () => {
    const root = createTempRoot("forge-runtime");
    const metaInfRoot = join(root, "src", "main", "resources", "META-INF");

    mkdirSync(metaInfRoot, { recursive: true });
    mkdirSync(join(root, "src", "main", "java", "example"), { recursive: true });

    writeFileSync(
      join(root, "build.gradle"),
      [
        'plugins { id "net.minecraftforge.gradle" }',
        "dependencies {",
        '  minecraft "net.minecraftforge:forge:1.20.1-47.2.0"',
        "}"
      ].join("\n")
    );
    writeFileSync(
      join(metaInfRoot, "mods.toml"),
      ['modLoader="javafml"', 'loaderVersion="[47,)"'].join("\n")
    );

    const detected = await detectWorkspace(root);

    expect(detected.kind).toBe("java-mod");
    expect(detected.hasGradle).toBe(true);
    expect(detected.hasJavaSource).toBe(true);
    expect(detected.currentRuntime.minecraftVersion).toBe("1.20.1");
    expect(detected.currentRuntime.loader).toBe("forge");
    expect(detected.currentRuntime.confidence).toBe("high");
  });

  it("returns unknown confidence with conflicting strong forge and neoforge evidence", async () => {
    const root = createTempRoot("conflicting-runtime");
    const metaInfRoot = join(root, "src", "main", "resources", "META-INF");

    mkdirSync(metaInfRoot, { recursive: true });

    writeFileSync(
      join(root, "build.gradle"),
      'dependencies { minecraft "net.minecraftforge:forge:1.20.1-47.2.0" }'
    );
    writeFileSync(
      join(metaInfRoot, "neoforge.mods.toml"),
      'loaderVersion="[21,)"'
    );

    const detected = await detectWorkspace(root);

    expect(detected.currentRuntime.confidence).toBe("unknown");
    expect(detected.currentRuntime.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("returns unknown confidence when high-confidence loader versions disagree", async () => {
    const root = createTempRoot("conflicting-loader-version");

    writeFileSync(
      join(root, "build.gradle"),
      'dependencies { minecraft "net.minecraftforge:forge:1.20.1-47.2.0" }'
    );
    writeFileSync(
      join(root, "settings.gradle"),
      'pluginManagement { resolutionStrategy.eachPlugin { useModule("net.minecraftforge:forge:1.20.1-47.1.0") } }'
    );

    const detected = await detectWorkspace(root);

    expect(detected.currentRuntime.confidence).toBe("unknown");
    expect(
      detected.currentRuntime.candidates.some(
        (candidate) => candidate.loaderVersion === "47.2.0"
      )
    ).toBe(true);
    expect(
      detected.currentRuntime.candidates.some(
        (candidate) => candidate.loaderVersion === "47.1.0"
      )
    ).toBe(true);
  });

  it("allows partial version-only runtime from pack.mcmeta", async () => {
    const root = createTempRoot("datapack-runtime");
    const resourcesRoot = join(root, "src", "main", "resources");

    mkdirSync(join(resourcesRoot, "data", "example"), { recursive: true });
    writeFileSync(
      join(resourcesRoot, "pack.mcmeta"),
      JSON.stringify({
        pack: {
          pack_format: 15
        }
      })
    );

    const detected = await detectWorkspace(root);

    expect(detected.hasDatapack).toBe(true);
    expect(detected.hasResourcePack).toBe(false);
    expect(detected.currentRuntime.minecraftVersion).toBe("1.20.1");
    expect(detected.currentRuntime.loader).toBeUndefined();
  });

  it("detects assets-only resource pack roots without pack.mcmeta", async () => {
    const root = createTempRoot("resource-assets-only");

    mkdirSync(join(root, "assets", "demo", "models", "item"), { recursive: true });
    writeFileSync(
      join(root, "assets", "demo", "models", "item", "gear.json"),
      "{}\n"
    );

    const detected = await detectWorkspace(root);

    expect(detected.hasDatapack).toBe(true);
    expect(detected.hasResourcePack).toBe(true);
    expect(detected.datapackRoots).toEqual([root]);
    expect(detected.resourcePackRoots).toEqual([root]);
    expect(detected.reasons).toContain("detected datapack or resource-pack content");
  });

  it("keeps prism instance layout as low-confidence hint only", async () => {
    const prismRoot = createTempRoot("prism-root");
    const minecraftRoot = join(
      prismRoot,
      "instances",
      "LostCivilization",
      "minecraft"
    );

    mkdirSync(minecraftRoot, { recursive: true });

    const detected = await detectWorkspace(minecraftRoot, { prismRoot });

    expect(detected.currentRuntime.confidence).toBe("low");
    expect(detected.currentRuntime.minecraftVersion).toBeUndefined();
    expect(detected.currentRuntime.loader).toBeUndefined();
    expect(
      detected.currentRuntime.evidence.some(
        (entry) => entry.kind === "prism-instance-root"
      )
    ).toBe(true);
    expect(detected.kind).toBe("unknown");
  });

  it("does not treat prism subdirectories as prism instance roots", async () => {
    const prismRoot = createTempRoot("prism-root-nested");
    const nestedWorkspaceRoot = join(
      prismRoot,
      "instances",
      "LostCivilization",
      "minecraft",
      "config"
    );

    mkdirSync(nestedWorkspaceRoot, { recursive: true });

    const detected = await detectWorkspace(nestedWorkspaceRoot, { prismRoot });

    expect(detected.currentRuntime.confidence).toBe("unknown");
    expect(
      detected.currentRuntime.evidence.some(
        (entry) => entry.kind === "prism-instance-root"
      )
    ).toBe(false);
  });

  it("does not infer modpack kind from prism and config-only heuristics", async () => {
    const prismRoot = createTempRoot("prism-root-kind");
    const minecraftRoot = join(
      prismRoot,
      "instances",
      "LostCivilization",
      "minecraft"
    );

    mkdirSync(join(minecraftRoot, "config"), { recursive: true });

    const detected = await detectWorkspace(minecraftRoot, { prismRoot });

    expect(detected.kind).toBe("unknown");
  });

  it("detects a KubeJS instance with mod jars as a modpack without prism metadata", async () => {
    const root = createTempRoot("kubejs-modpack");

    mkdirSync(join(root, "kubejs", "server_scripts"), { recursive: true });
    mkdirSync(join(root, "mods"), { recursive: true });
    writeFileSync(join(root, "mods", "content-mod.jar"), "");

    const detected = await detectWorkspace(root);

    expect(detected.kind).toBe("modpack");
    expect(detected.modArchivePaths).toEqual([join(root, "mods", "content-mod.jar")]);
    expect(detected.reasons).toContain("detected runtime mod jars");
  });

  it("detects local libs jars as mod archive evidence in Gradle mod workspaces", async () => {
    const root = createTempRoot("gradle-libs-heavy");

    mkdirSync(join(root, "libs"), { recursive: true });
    mkdirSync(join(root, "src", "main", "java", "example"), { recursive: true });
    writeFileSync(join(root, "settings.gradle"), 'rootProject.name = "demo"');
    writeFileSync(join(root, "build.gradle"), 'plugins { id "java" }');
    writeFileSync(join(root, "libs", "l2library-3.0.4.jar"), "");
    writeFileSync(join(root, "libs", "l2library-3.0.4-sources.jar"), "");

    const detected = await detectWorkspace(root);

    expect(detected.kind).toBe("java-mod");
    expect(detected.hasModArchives).toBe(true);
    expect(detected.modArchivePaths).toEqual([
      join(root, "libs", "l2library-3.0.4.jar")
    ]);
    expect(detected.reasons).toContain("detected runtime mod jars");
  });

  it("ignores non-directory log paths during best-effort log discovery", async () => {
    const root = createTempRoot("log-scan");

    writeFileSync(
      join(root, "build.gradle"),
      'dependencies { minecraft "net.minecraftforge:forge:1.20.1-47.2.0" }'
    );
    writeFileSync(join(root, "logs"), "not a directory");

    await expect(detectWorkspace(root)).resolves.toMatchObject({
      hasGradle: true
    });
  });
});
