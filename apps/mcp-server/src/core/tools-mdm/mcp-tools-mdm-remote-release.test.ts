import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { registerMcpServerTools, type McpToolHandler } from "../tools/mcp-tools.js";

const execFileAsync = promisify(execFile);

describe("mc_develop remote mdm-sources release acceptance", () => {
  it("installs real SQLite docs bytes from a GitHub Release shaped manifest URL", async () => {
    const mdmSourcesRoot = await findMdmSourcesRoot();
    if (!mdmSourcesRoot) {
      return;
    }

    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-remote-mdm-release-"));
    const copiedMdmSourcesRoot = join(tempRoot, "mdm-sources");
    const releaseOut = join(tempRoot, "release-out");
    const runtimeRoot = join(tempRoot, "runtime");
    const workspaceRoot = await createWorkspaceRoot(tempRoot);
    const registry = createCapturingRegistry();
    const manifestUrl =
      "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json";
    const manifestFetchUrls: string[] = [];
    const artifactFetchUrls: string[] = [];

    await cp(mdmSourcesRoot, copiedMdmSourcesRoot, {
      recursive: true,
      filter: (source) => !source.includes(`${mdmSourcesRoot}/.git`)
    });
    await execFileAsync("node", [
      "tools/build-local-release.mjs",
      "--out",
      releaseOut,
      "--channel",
      "docs"
    ], { cwd: copiedMdmSourcesRoot });

    const manifestText = await readFile(
      join(releaseOut, "mdm-release-manifest.json"),
      "utf-8"
    );
    const sqlitePackage = findReleasePackage(
      JSON.parse(manifestText),
      "core-docs-search-sqlite"
    );
    const artifactBytes = await readFile(join(releaseOut, sqlitePackage.artifactName));
    const artifactUrl = new URL(sqlitePackage.artifactName, manifestUrl).toString();

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: copiedMdmSourcesRoot,
        PATH: ""
      },
      mdmReleaseManifestFetch: async (url) => {
        manifestFetchUrls.push(url);

        return {
          ok: true,
          status: 200,
          text: async () => manifestText
        };
      },
      mdmArtifactFetch: async (url) => {
        artifactFetchUrls.push(url);

        return {
          ok: url === artifactUrl,
          status: url === artifactUrl ? 200 : 404,
          arrayBuffer: async () => artifactBytes
        };
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "Find sqlite index role docs from a remote MDM release.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestUrl,
        packageId: "core-docs-search-sqlite",
        downloadPolicy: "allowed"
      }
    });

    expect(result.isError).toBeUndefined();
    expect(manifestFetchUrls).toEqual([manifestUrl]);
    expect(artifactFetchUrls).toEqual([artifactUrl]);
    expect(result.structuredContent).toMatchObject({
      mdmReleaseInstall: {
        status: "downloaded",
        packageId: "core-docs-search-sqlite",
        artifactUrl,
        downloadPolicy: "allowed"
      },
      selectedEvidence: {
        routeStep: "docs_lookup",
        payload: {
          hits: expect.arrayContaining([
            expect.objectContaining({
              entryId: "mdm.sqlite-index-role",
              packageId: "core-docs-search-sqlite",
              source: "sqlite"
            })
          ]),
          trace: expect.objectContaining({
            sqliteArtifactPackageIds: expect.arrayContaining([
              "core-docs-search-sqlite"
            ]),
            sqliteMatchedEntryIds: expect.arrayContaining([
              "mdm.sqlite-index-role"
            ])
          })
        }
      }
    });
  }, 20_000);

  it("installs a bundled datapack member from a GitHub Release shaped manifest URL", async () => {
    const mdmSourcesRoot = await findMdmSourcesRoot();
    if (!mdmSourcesRoot) {
      return;
    }

    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-remote-mdm-bundle-"));
    const copiedMdmSourcesRoot = join(tempRoot, "mdm-sources");
    const releaseOut = join(tempRoot, "release-out");
    const runtimeRoot = join(tempRoot, "runtime");
    const workspaceRoot = await createWorkspaceRoot(tempRoot);
    const registry = createCapturingRegistry();
    const manifestUrl =
      "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json";
    const manifestFetchUrls: string[] = [];
    const artifactFetchUrls: string[] = [];

    await cp(mdmSourcesRoot, copiedMdmSourcesRoot, {
      recursive: true,
      filter: (source) => !source.includes(`${mdmSourcesRoot}/.git`)
    });
    await execFileAsync("node", [
      "tools/build-local-release.mjs",
      "--out",
      releaseOut,
      "--channel",
      "datapack",
      "--bundle-channel",
      "datapack"
    ], { cwd: copiedMdmSourcesRoot });

    const manifestText = await readFile(
      join(releaseOut, "mdm-release-manifest.json"),
      "utf-8"
    );
    const bundleUrl = new URL("datapack.mdm-bundle.json", manifestUrl).toString();
    const bundleBytes = await readFile(join(releaseOut, "datapack.mdm-bundle.json"));

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: copiedMdmSourcesRoot,
        PATH: ""
      },
      mdmReleaseManifestFetch: async (url) => {
        manifestFetchUrls.push(url);

        return {
          ok: true,
          status: 200,
          text: async () => manifestText
        };
      },
      mdmArtifactFetch: async (url) => {
        artifactFetchUrls.push(url);

        return {
          ok: url === bundleUrl,
          status: url === bundleUrl ? 200 : 404,
          arrayBuffer: async () => bundleBytes
        };
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "Install a bundled datapack package from a remote MDM release.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestUrl,
        packageId: "minecraft-1.20.1-vanilla-datapack-profile",
        downloadPolicy: "allowed"
      }
    });

    expect(result.isError).toBeUndefined();
    expect(manifestFetchUrls).toEqual([manifestUrl]);
    expect(artifactFetchUrls).toEqual([bundleUrl]);
    expect(result.structuredContent).toMatchObject({
      mdmReleaseInstall: {
        status: "downloaded",
        packageId: "minecraft-1.20.1-vanilla-datapack-profile",
        artifactUrl: bundleUrl,
        downloadPolicy: "allowed",
        state: {
          artifactName:
            "minecraft-1.20.1-vanilla-datapack-profile-0.1.0.mdm-resource.json"
        }
      }
    });
  }, 20_000);
});

async function createWorkspaceRoot(tempRoot: string): Promise<string> {
  const root = join(tempRoot, "workspace");

  await mkdir(join(root, "kubejs", "server_scripts"), { recursive: true });
  await writeFile(join(root, "kubejs", "server_scripts", "main.js"), "\n");

  return root;
}

async function findMdmSourcesRoot(): Promise<string | undefined> {
  const candidates = [
    resolve(process.cwd(), "..", "mdm-sources"),
    resolve(process.cwd(), "..", "..", "..", "mdm-sources"),
    resolve("/Users/gedwen/Documents/programing/MCProgrammingSkill/mdm-sources")
  ];

  for (const candidate of candidates) {
    if (await pathExists(join(candidate, "tools", "build-local-release.mjs"))) {
      return candidate;
    }
  }

  return undefined;
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
}

function findReleasePackage(manifest: unknown, packageId: string): ReleasePackage {
  if (!isRecord(manifest) || !Array.isArray(manifest.packages)) {
    throw new Error("Expected mdm release manifest with packages.");
  }

  const match = manifest.packages.find((candidate) => {
    return isRecord(candidate) && candidate.packageId === packageId;
  });
  if (!isRecord(match) || typeof match.artifactName !== "string") {
    throw new Error(`Expected release package ${packageId}.`);
  }

  return {
    artifactName: match.artifactName
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createCapturingRegistry(): CapturingRegistry {
  const calls: RegisteredToolCall[] = [];

  return {
    calls,
    registerTool(name, _config, handler) {
      calls.push({ name, handler });
    }
  };
}

interface ReleasePackage {
  artifactName: string;
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
