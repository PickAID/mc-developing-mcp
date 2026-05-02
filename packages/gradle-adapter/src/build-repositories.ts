import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface GradleMavenRepository {
  name: string;
  url: string;
  sourceFile: string;
}

type ExtractedGradleMavenRepository = Omit<GradleMavenRepository, "sourceFile">;

const GRADLE_REPOSITORY_FILES = [
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts"
] as const;

export async function readGradleMavenRepositories(input: {
  workspaceRoot: string;
}): Promise<GradleMavenRepository[]> {
  const repositories: GradleMavenRepository[] = [];

  for (const sourceFile of GRADLE_REPOSITORY_FILES) {
    let content: string;

    try {
      content = await readFile(join(input.workspaceRoot, sourceFile), "utf-8");
    } catch (error) {
      if (isFileNotFound(error)) {
        continue;
      }
      throw error;
    }

    repositories.push(
      ...extractGradleMavenRepositories(content).map((repository) => ({
        ...repository,
        sourceFile
      }))
    );
  }

  return dedupeRepositories(repositories);
}

export function extractGradleMavenRepositories(
  content: string
): ExtractedGradleMavenRepository[] {
  return dedupeRepositories([
    ...extractExplicitMavenRepositories(content),
    ...extractWellKnownRepositories(content)
  ]);
}

function extractExplicitMavenRepositories(
  content: string
): ExtractedGradleMavenRepository[] {
  const repositories: Array<ExtractedGradleMavenRepository & { index: number }> = [];
  const patterns = [
    /\bmaven\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bmaven\s*\(\s*url\s*=\s*uri\s*\(\s*["']([^"']+)["']\s*\)\s*\)/g,
    /\bmaven\s*\{[^}]*\burl\s*=\s*(?:uri\s*\(\s*)?["']([^"']+)["']/g,
    /\bmaven\s*\{[^}]*\burl\s+["']([^"']+)["']/g
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      repositories.push({
        name: "declared-maven-repository",
        url: trimRepositoryUrl(match[1]),
        index: match.index
      });
    }
  }

  return repositories
    .sort((left, right) => left.index - right.index)
    .map(({ index: _index, ...repository }) => repository);
}

function extractWellKnownRepositories(
  content: string
): ExtractedGradleMavenRepository[] {
  const repositories: ExtractedGradleMavenRepository[] = [];

  if (/\bmavenCentral\s*\(/.test(content)) {
    repositories.push({
      name: "Maven Central",
      url: "https://repo.maven.apache.org/maven2"
    });
  }

  if (/\bgoogle\s*\(/.test(content)) {
    repositories.push({
      name: "Google Maven",
      url: "https://maven.google.com"
    });
  }

  if (/\bgradlePluginPortal\s*\(/.test(content)) {
    repositories.push({
      name: "Gradle Plugin Portal",
      url: "https://plugins.gradle.org/m2"
    });
  }

  return repositories;
}

function trimRepositoryUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function dedupeRepositories<T extends { url: string }>(repositories: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const repository of repositories) {
    const key = repository.url;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(repository);
  }

  return result;
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
