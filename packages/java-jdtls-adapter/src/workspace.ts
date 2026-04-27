import { access, stat } from "node:fs/promises";
import { join } from "node:path";

import type { JavaWorkspaceSignals } from "./types.js";

const GRADLE_BUILD_FILES = ["build.gradle", "build.gradle.kts"] as const;
const GRADLE_SETTINGS_FILES = ["settings.gradle", "settings.gradle.kts"] as const;

export async function detectJavaWorkspaceSignals(
  workspaceRoot: string
): Promise<JavaWorkspaceSignals> {
  const gradleBuildFiles = await existingFiles(workspaceRoot, GRADLE_BUILD_FILES);
  const gradleSettingsFiles = await existingFiles(workspaceRoot, GRADLE_SETTINGS_FILES);
  const mavenPom = join(workspaceRoot, "pom.xml");
  const javaSourceRoot = join(workspaceRoot, "src", "main", "java");
  const hasMavenPom = await fileExists(mavenPom);
  const hasJavaSourceRoot = await directoryExists(javaSourceRoot);

  return {
    hasGradleBuild: gradleBuildFiles.length > 0,
    hasGradleSettings: gradleSettingsFiles.length > 0,
    hasMavenPom,
    hasJavaSourceRoot,
    buildFiles: [
      ...gradleBuildFiles,
      ...gradleSettingsFiles,
      ...(hasMavenPom ? [mavenPom] : [])
    ],
    sourceRoots: hasJavaSourceRoot ? [javaSourceRoot] : []
  };
}

export function isJavaWorkspace(signals: JavaWorkspaceSignals): boolean {
  return (
    signals.hasGradleBuild ||
    signals.hasGradleSettings ||
    signals.hasMavenPom ||
    signals.hasJavaSourceRoot
  );
}

async function existingFiles(
  workspaceRoot: string,
  fileNames: readonly string[]
): Promise<string[]> {
  const checks = await Promise.all(
    fileNames.map(async (fileName) => {
      const path = join(workspaceRoot, fileName);
      return (await fileExists(path)) ? path : undefined;
    })
  );

  return checks.filter((path): path is string => path !== undefined);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const fileStat = await stat(path);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const directoryStat = await stat(path);
    return directoryStat.isDirectory();
  } catch {
    return false;
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
