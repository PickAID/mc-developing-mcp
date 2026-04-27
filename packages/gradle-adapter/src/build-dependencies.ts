import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface GradleDeclaredDependency {
  group: string;
  artifact: string;
  version?: string;
  notation: string;
  sourceFile: string;
}

export async function readGradleDeclaredDependencies(input: {
  workspaceRoot: string;
}): Promise<GradleDeclaredDependency[]> {
  const dependencies: GradleDeclaredDependency[] = [];
  const versionCatalog = await readGradleVersionCatalog(input.workspaceRoot);

  for (const sourceFile of ["build.gradle", "build.gradle.kts"]) {
    const sourcePath = join(input.workspaceRoot, sourceFile);
    let content: string;

    try {
      content = await readFile(sourcePath, "utf-8");
    } catch (error) {
      if (isFileNotFound(error)) {
        continue;
      }
      throw error;
    }

    dependencies.push(
      ...extractGradleDeclaredDependencies(content, versionCatalog).map((dependency) => ({
        ...dependency,
        sourceFile
      }))
    );
  }

  return dedupeDependencies(dependencies);
}

export function extractGradleDeclaredDependencies(
  content: string,
  versionCatalog: GradleVersionCatalog = new Map()
): Array<Omit<GradleDeclaredDependency, "sourceFile">> {
  const dependencies: Array<Omit<GradleDeclaredDependency, "sourceFile">> = [];
  const patterns = [
    /(?:implementation|api|compileOnly|runtimeOnly|annotationProcessor|minecraft|modImplementation|modApi|modCompileOnly|modRuntimeOnly)\s*\(?\s*["']([^"']+)["']\s*\)?/g,
    /(?:implementation|api|compileOnly|runtimeOnly|annotationProcessor|minecraft|modImplementation|modApi|modCompileOnly|modRuntimeOnly)\s*\(\s*group\s*=\s*["']([^"']+)["']\s*,\s*name\s*=\s*["']([^"']+)["'](?:\s*,\s*version\s*=\s*["']([^"']+)["'])?/g
  ];

  for (const match of content.matchAll(patterns[0])) {
    const dependency = parseDependencyNotation(match[1]);
    if (dependency) {
      dependencies.push(dependency);
    }
  }
  for (const match of content.matchAll(patterns[1])) {
    dependencies.push({
      group: match[1],
      artifact: match[2],
      version: match[3],
      notation: [match[1], match[2], match[3]].filter(Boolean).join(":")
    });
  }
  for (const match of content.matchAll(
    /(?:implementation|api|compileOnly|runtimeOnly|annotationProcessor|minecraft|modImplementation|modApi|modCompileOnly|modRuntimeOnly)\s*\(?\s*libs\.([A-Za-z0-9_.-]+)\s*\)?/g
  )) {
    const dependency = versionCatalog.get(normalizeCatalogAlias(match[1]));
    if (dependency) {
      dependencies.push(dependency);
    }
  }

  return dependencies;
}

type GradleVersionCatalog = Map<
  string,
  Omit<GradleDeclaredDependency, "sourceFile">
>;

async function readGradleVersionCatalog(
  workspaceRoot: string
): Promise<GradleVersionCatalog> {
  try {
    return parseGradleVersionCatalog(
      await readFile(join(workspaceRoot, "gradle", "libs.versions.toml"), "utf-8")
    );
  } catch (error) {
    if (isFileNotFound(error)) {
      return new Map();
    }
    throw error;
  }
}

function parseGradleVersionCatalog(content: string): GradleVersionCatalog {
  const versions = new Map<string, string>();
  const libraries = new Map<string, Omit<GradleDeclaredDependency, "sourceFile">>();
  let section: "versions" | "libraries" | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();

    if (line === "[versions]") {
      section = "versions";
      continue;
    }
    if (line === "[libraries]") {
      section = "libraries";
      continue;
    }
    if (line.startsWith("[") || !line.includes("=")) {
      section = line.startsWith("[") ? undefined : section;
      continue;
    }

    const [rawKey, ...rawValueParts] = line.split("=");
    const key = rawKey.trim();
    const value = rawValueParts.join("=").trim();

    if (section === "versions") {
      const version = readQuotedValue(value);
      if (version) {
        versions.set(key, version);
      }
      continue;
    }

    if (section === "libraries") {
      const dependency = parseCatalogLibrary(value, versions);
      if (dependency) {
        libraries.set(normalizeCatalogAlias(key), dependency);
      }
    }
  }

  return libraries;
}

function parseCatalogLibrary(
  value: string,
  versions: Map<string, string>
): Omit<GradleDeclaredDependency, "sourceFile"> | undefined {
  if (!value.startsWith("{")) {
    const notation = readQuotedValue(value);
    return notation ? parseDependencyNotation(notation) : undefined;
  }

  const module = readObjectStringProperty(value, "module");
  const group = readObjectStringProperty(value, "group");
  const artifact = readObjectStringProperty(value, "name");
  const version =
    readObjectStringProperty(value, "version") ??
    versions.get(readObjectStringProperty(value, "version.ref") ?? "") ??
    versions.get(readObjectStringProperty(value, "ref") ?? "");

  if (module) {
    return parseDependencyNotation([module, version].filter(Boolean).join(":"));
  }
  if (group && artifact) {
    return parseDependencyNotation([group, artifact, version].filter(Boolean).join(":"));
  }

  return undefined;
}

function readObjectStringProperty(
  objectLiteral: string,
  propertyName: string
): string | undefined {
  const escapedPropertyName = propertyName.replace(".", "\\.");
  const match = objectLiteral.match(
    new RegExp(`(?:^|[,\\s])${escapedPropertyName}\\s*=\\s*["']([^"']+)["']`)
  );

  return match?.[1];
}

function readQuotedValue(value: string): string | undefined {
  return value.match(/^["']([^"']+)["']/)?.[1];
}

function normalizeCatalogAlias(alias: string): string {
  return alias.replace(/[-_]/g, ".").toLowerCase();
}

function parseDependencyNotation(
  notation: string
): Omit<GradleDeclaredDependency, "sourceFile"> | undefined {
  const [group, artifact, version] = notation.split(":");

  if (!group || !artifact) {
    return undefined;
  }

  return {
    group,
    artifact,
    version,
    notation
  };
}

function dedupeDependencies(
  dependencies: GradleDeclaredDependency[]
): GradleDeclaredDependency[] {
  const seen = new Set<string>();
  const result: GradleDeclaredDependency[] = [];

  for (const dependency of dependencies) {
    const key = dependency.notation;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(dependency);
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
