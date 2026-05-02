import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractGradleMavenRepositories,
  readGradleMavenRepositories
} from "./build-repositories.js";

describe("extractGradleMavenRepositories", () => {
  it("extracts common Groovy and Kotlin Maven repository declarations", () => {
    expect(
      extractGradleMavenRepositories(`
        repositories {
          maven { url = "https://maven.example/releases" }
          maven { url "https://legacy.example/maven" }
          maven("https://jitpack.io")
          mavenCentral()
          google()
        }
      `)
    ).toEqual([
      {
        name: "declared-maven-repository",
        url: "https://maven.example/releases"
      },
      {
        name: "declared-maven-repository",
        url: "https://legacy.example/maven"
      },
      {
        name: "declared-maven-repository",
        url: "https://jitpack.io"
      },
      {
        name: "Maven Central",
        url: "https://repo.maven.apache.org/maven2"
      },
      {
        name: "Google Maven",
        url: "https://maven.google.com"
      }
    ]);
  });
});

describe("readGradleMavenRepositories", () => {
  it("reads Maven repositories from Gradle build and settings files", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "mcpskill-gradle-repos-"));

    await writeGradleFile(
      workspaceRoot,
      "settings.gradle",
      'pluginManagement { repositories { maven { url = "https://plugins.example/maven" } } }\n'
    );
    await writeGradleFile(
      workspaceRoot,
      "build.gradle.kts",
      'repositories { maven("https://maven.example/releases") }\n'
    );

    await expect(
      readGradleMavenRepositories({ workspaceRoot })
    ).resolves.toMatchObject([
      {
        name: "declared-maven-repository",
        url: "https://maven.example/releases",
        sourceFile: "build.gradle.kts"
      },
      {
        name: "declared-maven-repository",
        url: "https://plugins.example/maven",
        sourceFile: "settings.gradle"
      }
    ]);
  });
});

async function writeGradleFile(
  workspaceRoot: string,
  fileName: string,
  content: string
): Promise<void> {
  const targetPath = join(workspaceRoot, fileName);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content);
}
