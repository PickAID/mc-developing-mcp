import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { formatServiceProfilePrompt } from "./guidance.js";
import { buildMinecraftServiceProfile } from "./profile.js";

describe("buildMinecraftServiceProfile", () => {
  it("aggregates Gradle, JDTLS, ProbeJS, datapack, package-manager, and source-index capabilities", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-service-profile-"));
    const runtimeRoot = await mkdtemp(join(tmpdir(), "mcpskill-service-runtime-"));
    const gradleUserHome = await mkdtemp(join(tmpdir(), "mcpskill-gradle-home-"));
    const sourceIndex = join(
      runtimeRoot,
      "installs",
      "source-packages",
      "minecraft",
      "1.20.1",
      "source-pack",
      "named",
      "source-index.sqlite"
    );

    await mkdir(join(workspaceRoot, "src", "main", "java", "demo"), {
      recursive: true
    });
    await mkdir(join(workspaceRoot, ".probejs"), { recursive: true });
    await mkdir(join(workspaceRoot, "kubejs"), { recursive: true });
    await mkdir(join(workspaceRoot, "data", "demo", "recipes"), {
      recursive: true
    });
    await mkdir(join(workspaceRoot, "assets", "demo", "lang"), {
      recursive: true
    });
    await mkdir(join(workspaceRoot, "mods"), { recursive: true });
    await mkdir(join(sourceIndex, ".."), { recursive: true });
    await mkdir(
      join(
        gradleUserHome,
        "caches",
        "modules-2",
        "files-2.1",
        "net.minecraft",
        "client",
        "1.20.1",
        "hash"
      ),
      { recursive: true }
    );

    await writeFile(
      join(workspaceRoot, "build.gradle"),
      [
        "plugins { id 'net.neoforged.moddev' version '1.0.0' }",
        "dependencies { implementation 'net.neoforged:neoforge:21.1.1' }",
        "minecraft_version = '1.21.1'"
      ].join("\n")
    );
    await writeFile(
      join(workspaceRoot, "src", "main", "java", "demo", "Example.java"),
      "package demo; public class Example {}\n"
    );
    await writeFile(
      join(workspaceRoot, ".probejs", "global.d.ts"),
      "declare const Item: unknown;\n"
    );
    await writeFile(
      join(workspaceRoot, "data", "demo", "recipes", "stone.json"),
      "{\"result\":\"minecraft:stone\"}\n"
    );
    await writeFile(
      join(workspaceRoot, "assets", "demo", "lang", "en_us.json"),
      "{\"item.demo.foo\":\"Foo\"}\n"
    );
    await writeFile(join(workspaceRoot, "mods", "content-mod.jar"), "");
    await writeFile(sourceIndex, "sqlite placeholder");
    await writeFile(
      join(
        gradleUserHome,
        "caches",
        "modules-2",
        "files-2.1",
        "net.minecraft",
        "client",
        "1.20.1",
        "hash",
        "client-1.20.1-sources.jar"
      ),
      ""
    );

    const profile = await buildMinecraftServiceProfile({
      workspaceRoot,
      runtimeRoot,
      gradleUserHome,
      includeDefaultGradleUserHome: false,
      executableResolver: async (name) => `/toolchain/bin/${name}`,
      env: {
        JAVA_HOME: "/toolchain/java",
        JDTLS_PATH: "/toolchain/bin/jdtls"
      }
    });

    expect(profile.workspaceKind).toBe("modpack");
    expect(profile.runtime?.minecraftVersion).toBe("1.21.1");
    expect(profile.capabilities.gradle).toMatchObject({
      status: "ready",
      buildFileCount: 1,
      sourceArchiveCount: 1
    });
    expect(profile.capabilities.javaLsp).toMatchObject({
      status: "ready",
      jdtlsExecutable: "/toolchain/bin/jdtls"
    });
    expect(profile.capabilities.kubejsTypes).toMatchObject({
      status: "ready",
      rootCount: 1,
      fileCount: 1
    });
    expect(profile.capabilities.datapack).toMatchObject({
      status: "ready",
      rootCount: 1,
      namespaces: ["demo"],
      dataKinds: ["recipes"],
      assetKinds: ["lang"]
    });
    expect(profile.capabilities.resourcePack).toMatchObject({
      status: "ready",
      rootCount: 1,
      fileCount: 1,
      namespaces: ["demo"],
      assetKinds: ["lang"]
    });
    expect(profile.capabilities.packageManager).toMatchObject({
      status: "ready",
      runtimeRoot
    });
    expect(profile.capabilities.sourceIndex).toMatchObject({
      status: "ready",
      databaseCount: 1
    });
    expect(profile.capabilities.modArchives).toMatchObject({
      status: "ready",
      archiveCount: 1,
      archives: [
        {
          relativePath: "mods/content-mod.jar",
          source: "mods-directory"
        }
      ]
    });
    expect(profile.guidance).toContain(
      "Use ProbeJS/d.ts evidence before generic JavaScript assumptions for KubeJS."
    );
    expect(profile.guidance).toContain(
      "Use discovered mod jar data/assets/source content for external mod evidence before assuming it is absent."
    );
    for (const entry of profile.guidance) {
      expect(entry.length).toBeLessThanOrEqual(160);
      expect(entry).not.toMatch(/nine-slice|grid|dynamic-window/i);
    }
    expect(formatServiceProfilePrompt(profile)).toContain(
      "Java LSP: ready, implemented=definition,references,hover,workspaceSymbol,diagnostics"
    );
    expect(formatServiceProfilePrompt(profile)).toContain(
      "Mod archives: ready, archives=1"
    );
    expect(formatServiceProfilePrompt(profile)).toContain(
      "Resource pack: ready, assets=1, kinds=lang"
    );
  });

  it("keeps assets-only resource packs separate from datapack capability", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-service-assets-"));

    await mkdir(join(workspaceRoot, "assets", "demo", "models", "item"), {
      recursive: true
    });
    await writeFile(
      join(workspaceRoot, "assets", "demo", "models", "item", "gear.json"),
      "{\"parent\":\"minecraft:item/generated\"}\n"
    );

    const profile = await buildMinecraftServiceProfile({
      workspaceRoot,
      includeDefaultGradleUserHome: false,
      executableResolver: async () => undefined,
      env: {}
    });

    expect(profile.capabilities.datapack).toMatchObject({
      status: "not_found",
      rootCount: 0,
      fileCount: 0,
      dataKinds: []
    });
    expect(profile.capabilities.resourcePack).toMatchObject({
      status: "ready",
      rootCount: 1,
      fileCount: 1,
      namespaces: ["demo"],
      assetKinds: ["models"]
    });
    expect(profile.guidance).not.toContain(
      "Use datapack data namespaces and concrete JSON content before docs fallback."
    );
    expect(profile.guidance).toContain(
      "Use resource-pack assets, model references, and pack metadata before docs fallback."
    );
    expect(formatServiceProfilePrompt(profile)).toContain(
      "Datapack: not_found, data=0, namespaces=none"
    );
    expect(formatServiceProfilePrompt(profile)).toContain(
      "Resource pack: ready, assets=1, kinds=models"
    );
  });
});
