import { access, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, join, normalize, resolve } from "node:path";

export interface WorkspaceScan {
  root: string;
  hasGradle: boolean;
  hasKubeJS: boolean;
  hasProbeJS: boolean;
  hasModArchives: boolean;
  hasJavaSource: boolean;
  hasDatapack: boolean;
  buildFiles: string[];
  javaSourceRoots: string[];
  modArchivePaths: string[];
  resourceRoots: string[];
  datapackRoots: string[];
  logPaths: string[];
}

const BUILD_FILE_CANDIDATES = [
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.properties",
  "gradle/libs.versions.toml"
] as const;

const JAVA_SOURCE_CANDIDATES = [
  "src/main/java",
  "src/client/java",
  "src/test/java"
] as const;

const RESOURCE_ROOT_CANDIDATES = [
  "src/main/resources",
  "src/generated/resources",
  "src/test/resources"
] as const;

const PROBE_CANDIDATES = [
  "probe",
  "probejs",
  ".probe",
  ".probejs",
  "kubejs/probe",
  "kubejs/probejs",
  "kubejs/.probe",
  "kubejs/.probejs"
] as const;

const LOG_FILE_CANDIDATES = [
  "logs/latest.log",
  "logs/debug.log",
  "logs/latest.txt"
] as const;

const MOD_ARCHIVE_ROOT_CANDIDATES = [
  "libs",
  "mods",
  "run/mods",
  "run/client/mods"
] as const;

export async function scanWorkspace(root: string): Promise<WorkspaceScan> {
  const normalizedRoot = normalize(resolve(root));
  const buildFiles = await findExistingFiles(normalizedRoot, BUILD_FILE_CANDIDATES);
  const javaSourceRoots = await findExistingDirectories(
    normalizedRoot,
    JAVA_SOURCE_CANDIDATES
  );
  const resourceRoots = await findExistingDirectories(
    normalizedRoot,
    RESOURCE_ROOT_CANDIDATES
  );
  const probeRoots = await findExistingDirectories(normalizedRoot, PROBE_CANDIDATES);
  const hasKubeJS = await pathIsDirectory(join(normalizedRoot, "kubejs"));
  const modArchivePaths = await findRuntimeModArchives(normalizedRoot);
  const datapackRoots = await findDatapackRoots(normalizedRoot, resourceRoots);
  const logPaths = await findLogPaths(normalizedRoot);

  return {
    root: normalizedRoot,
    hasGradle: buildFiles.some((filePath) => isGradleBuildFile(filePath)),
    hasKubeJS,
    hasProbeJS: probeRoots.length > 0,
    hasModArchives: modArchivePaths.length > 0,
    hasJavaSource: javaSourceRoots.length > 0,
    hasDatapack: datapackRoots.length > 0,
    buildFiles,
    javaSourceRoots,
    modArchivePaths,
    resourceRoots,
    datapackRoots,
    logPaths
  };
}

async function findRuntimeModArchives(root: string): Promise<string[]> {
  const archivePaths: string[] = [];

  for (const relativePath of MOD_ARCHIVE_ROOT_CANDIDATES) {
    archivePaths.push(...(await listRuntimeJars(join(root, relativePath))));
  }

  return uniquePaths(archivePaths).sort((left, right) => left.localeCompare(right));
}

async function listRuntimeJars(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isRuntimeJarName(entry.name))
      .map((entry) => join(directory, entry.name));
  } catch (error) {
    if (isSkippablePathError(error)) {
      return [];
    }
    throw error;
  }
}

async function findDatapackRoots(
  root: string,
  resourceRoots: string[]
): Promise<string[]> {
  const datapackRoots: string[] = [];

  if (await hasDatapackOrResourceContent(root)) {
    datapackRoots.push(root);
  }

  for (const resourceRoot of resourceRoots) {
    if (await hasDatapackOrResourceContent(resourceRoot)) {
      datapackRoots.push(resourceRoot);
    }
  }

  return uniquePaths(datapackRoots);
}

async function hasDatapackOrResourceContent(root: string): Promise<boolean> {
  return (
    (await pathIsFile(join(root, "pack.mcmeta"))) ||
    (await pathIsDirectory(join(root, "data"))) ||
    (await pathIsDirectory(join(root, "assets")))
  );
}

async function findLogPaths(root: string): Promise<string[]> {
  const directLogs = await findExistingFiles(root, LOG_FILE_CANDIDATES);
  const crashReports = await listFilesIfPresent(join(root, "crash-reports"));
  const rootLogs = await listFilesIfPresent(join(root, "logs"));

  const selectedLogs = rootLogs.filter((entry) => {
    const name = basename(entry);
    return name.endsWith(".log") || name.endsWith(".txt");
  });

  return uniquePaths([...directLogs, ...selectedLogs, ...crashReports]);
}

async function listFilesIfPresent(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(directory, entry.name));
  } catch (error) {
    if (isSkippablePathError(error)) {
      return [];
    }
    throw error;
  }
}

async function findExistingFiles(
  root: string,
  relativePaths: readonly string[]
): Promise<string[]> {
  const results = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const absolutePath = join(root, relativePath);
      return (await pathIsFile(absolutePath)) ? absolutePath : undefined;
    })
  );

  return results.filter((value): value is string => value !== undefined);
}

async function findExistingDirectories(
  root: string,
  relativePaths: readonly string[]
): Promise<string[]> {
  const results = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const absolutePath = join(root, relativePath);
      return (await pathIsDirectory(absolutePath)) ? absolutePath : undefined;
    })
  );

  return results.filter((value): value is string => value !== undefined);
}

async function pathIsFile(filePath: string): Promise<boolean> {
  try {
    const details = await stat(filePath);
    return details.isFile();
  } catch (error) {
    if (isSkippablePathError(error)) {
      return false;
    }
    throw error;
  }
}

async function pathIsDirectory(directoryPath: string): Promise<boolean> {
  try {
    const details = await stat(directoryPath);
    return details.isDirectory();
  } catch (error) {
    if (isSkippablePathError(error)) {
      return false;
    }
    throw error;
  }
}

function isGradleBuildFile(filePath: string): boolean {
  const name = basename(filePath);
  return (
    name === "build.gradle" ||
    name === "build.gradle.kts" ||
    name === "settings.gradle" ||
    name === "settings.gradle.kts" ||
    name === "gradle.properties" ||
    filePath.endsWith("gradle/libs.versions.toml")
  );
}

function isRuntimeJarName(name: string): boolean {
  return (
    name.endsWith(".jar") &&
    !/(?:^|[-_.])(sources|javadoc)\.jar$/i.test(name)
  );
}

function isSkippablePathError(error: unknown): boolean {
  const code =
    error instanceof Error && "code" in error
      ? (error as NodeJS.ErrnoException).code
      : undefined;

  return (
    code === "ENOENT" ||
    code === "ENOTDIR" ||
    code === "EACCES" ||
    code === "EPERM" ||
    code === "ELOOP"
  );
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (isSkippablePathError(error)) {
      return false;
    }
    throw error;
  }
}
