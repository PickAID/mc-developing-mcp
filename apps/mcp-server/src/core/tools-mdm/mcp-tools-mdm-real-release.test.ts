import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { registerMcpServerTools, type McpToolHandler } from "../tools/mcp-tools.js";

const execFileAsync = promisify(execFile);

describe("mc_develop real mdm-sources release consumption", () => {
  it("installs and searches a real mdm-sources SQLite docs release artifact", async () => {
    const mdmSourcesRoot = await findMdmSourcesRoot();
    if (!mdmSourcesRoot) {
      return;
    }

    const tempRoot = await mkdtemp(join(tmpdir(), "mcpskill-real-mdm-release-"));
    const copiedMdmSourcesRoot = join(tempRoot, "mdm-sources");
    const releaseOut = join(tempRoot, "release-out");
    const runtimeRoot = join(tempRoot, "runtime");
    const workspaceRoot = await createWorkspaceRoot(tempRoot);
    const registry = createCapturingRegistry();

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

    registerMcpServerTools(registry, {
      env: {
        MDM_SOURCES_ROOT: copiedMdmSourcesRoot,
        PATH: ""
      }
    });

    const result = await registry.calls[0].handler({
      requestText: "Find sqlite index role docs for offline MDM package queries.",
      runtimeRoot,
      workspaceRoot,
      mdmReleaseInstall: {
        manifestPath: join(releaseOut, "mdm-release-manifest.json"),
        packageId: "core-docs-search-sqlite",
        downloadPolicy: "allowed"
      }
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      mdmReleaseInstall: {
        status: "downloaded",
        packageId: "core-docs-search-sqlite",
        downloadPolicy: "allowed"
      },
      mdmResources: {
        summary: {
          counts: expect.objectContaining({
            ready: expect.any(Number)
          })
        }
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

function createCapturingRegistry(): CapturingRegistry {
  const calls: RegisteredToolCall[] = [];

  return {
    calls,
    registerTool(name, _config, handler) {
      calls.push({ name, handler });
    }
  };
}

interface CapturingRegistry {
  calls: RegisteredToolCall[];
  registerTool(name: string, config: unknown, handler: McpToolHandler): unknown;
}

interface RegisteredToolCall {
  name: string;
  handler: McpToolHandler;
}
