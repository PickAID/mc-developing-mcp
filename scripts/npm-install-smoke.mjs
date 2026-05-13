import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { publishablePackages } from "./npm-publish-packages.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "mc-developing-mcp-install-smoke-"));
const tarballRoot = join(tempRoot, "tarballs");
const installRoot = join(tempRoot, "install");

try {
  mkdirSync(tarballRoot, { recursive: true });
  mkdirSync(installRoot, { recursive: true });
  const tarballs = publishablePackages.map(packPackage);
  writeFileSync(
    join(installRoot, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2)
  );
  mkdirSync(join(installRoot, "kubejs", "server_scripts"), { recursive: true });
  writeFileSync(join(installRoot, "kubejs", "server_scripts", "main.js"), "\n");

  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--fund=false",
    ...tarballs
  ], installRoot);

  const mdmSourcesRoot = prepareMdmSourcesRelease();
  await smokeInstalledBinary({ mdmSourcesRoot });
  console.log(`npm install smoke passed with ${tarballs.length} local package tarball(s).`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function packPackage(packageDir) {
  const result = run(
    "pnpm",
    ["--dir", packageDir, "pack", "--pack-destination", tarballRoot, "--json"],
    process.cwd()
  );
  const packResult = JSON.parse(result.stdout);

  return packResult.filename;
}

async function smokeInstalledBinary({ mdmSourcesRoot }) {
  const binPath = join(
    installRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "mc-developing-mcp.cmd" : "mc-developing-mcp"
  );
  const child = spawn(binPath, [], {
    cwd: installRoot,
    env: {
      ...process.env,
      PATH: `${join(installRoot, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
      MC_DEVELOPING_MCP_RUNTIME_ROOT: join(tempRoot, "runtime"),
      MC_DEVELOPING_MCP_WORKSPACE_ROOT: installRoot,
      MDM_SOURCES_ROOT: mdmSourcesRoot
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stderr = [];
  const responses = [];
  let exitStatus;
  const timeout = setTimeout(() => {
    child.kill();
  }, 5_000);

  child.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf-8")));
  child.on("exit", (code, signal) => {
    exitStatus = { code, signal };
  });
  child.stdout.on("data", (chunk) => {
    for (const line of chunk.toString("utf-8").split("\n")) {
      if (line.trim().length > 0) {
        responses.push(JSON.parse(line));
      }
    }
  });

  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mc-developing-mcp-install-smoke", version: "0.0.0" }
    }
  })}\n`);
  await waitFor(() => responses.some((response) => response.id === 1), {
    stderr,
    getExitStatus: () => exitStatus
  });
  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  })}\n`);
  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  })}\n`);
  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "mc_develop",
      arguments: {
        requestText:
          "Explain vanilla-mcdoc recipe datapack schema using upstream schema evidence.",
        mdmReleaseInstall: {
          manifestPath: join(mdmSourcesRoot, "release-out", "mdm-release-manifest.json"),
          packageId: "vanilla-schema-docs",
          downloadPolicy: "allowed"
        }
      }
    }
  })}\n`);

  await waitFor(() => responses.some((response) => response.id === 2), {
    stderr,
    getExitStatus: () => exitStatus
  });
  await waitFor(() => responses.some((response) => response.id === 3), {
    stderr,
    getExitStatus: () => exitStatus
  });
  clearTimeout(timeout);
  child.kill();

  const initialize = responses.find((response) => response.id === 1);
  const tools = responses.find((response) => response.id === 2);
  const mcDevelop = responses.find((response) => response.id === 3);

  if (initialize?.result?.serverInfo?.name !== "mc-developing-mcp") {
    throw new Error(`Installed MCP server did not initialize correctly.\n${stderr.join("")}`);
  }
  const mcDevelopTool = tools?.result?.tools?.find(
    (tool) => tool.name === "mc_develop"
  );
  if (!mcDevelopTool) {
    throw new Error(`Installed MCP server did not expose mc_develop.\n${stderr.join("")}`);
  }
  assertToolDescription(mcDevelopTool.description, stderr);
  assertVanillaSchemaDocsResult(mcDevelop, stderr);
}

async function waitFor(predicate, context) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const status = context.getExitStatus();
  const statusText = status
    ? ` Process exit status: ${JSON.stringify(status)}.`
    : "";
  const stderrText = context.stderr.join("").trim();

  throw new Error(
    `Timed out waiting for installed MCP server response.${statusText}` +
      (stderrText ? `\nStderr:\n${stderrText}` : "")
  );
}

function prepareMdmSourcesRelease() {
  const sourceRoot = findMdmSourcesRoot();
  const copiedRoot = join(tempRoot, "mdm-sources");
  const releaseOut = join(copiedRoot, "release-out");

  cpSync(sourceRoot, copiedRoot, {
    recursive: true,
    filter: (source) => !source.includes(`${sourceRoot}/.git`)
  });
  run("node", [
    "tools/build-local-release.mjs",
    "--out",
    releaseOut,
    "--channel",
    "docs",
    "--bundle-channel",
    "docs",
    "--no-registry-update"
  ], copiedRoot);

  return copiedRoot;
}

function findMdmSourcesRoot() {
  const candidates = [
    process.env.MDM_SOURCES_ROOT,
    "/Users/gedwen/.local/share/mc-developing-mcp/mdm-sources"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "tools", "build-local-release.mjs"))) {
      return candidate;
    }
  }

  throw new Error("Could not find mdm-sources for install smoke.");
}

function assertVanillaSchemaDocsResult(response, stderr) {
  const structured = response?.result?.structuredContent;
  const hits = structured?.selectedEvidence?.payload?.hits;
  if (!Array.isArray(hits)) {
    throw new Error(
      `Installed mc_develop did not return docs hits. Trace=${JSON.stringify(structured?.trace)}\n${stderr.join("")}`
    );
  }

  const hit = hits.find((entry) =>
    entry?.packageId === "vanilla-schema-docs" &&
    entry?.entryId === "vanilla-schema-docs-datapack-mcdoc-java-data-recipe" &&
    entry?.source === "sqlite"
  );
  if (!hit) {
    throw new Error(
      `Installed mc_develop did not query bundled vanilla-schema-docs sqlite evidence.\n${stderr.join("")}`
    );
  }
  if (
    hit.metadata?.schemaSymbol?.source !== "vanilla-mcdoc-generated-symbols" ||
    hit.metadata?.upstreamPath !== "java/data/recipe.mcdoc"
  ) {
    throw new Error(
      `Installed mc_develop did not preserve vanilla schema metadata.\n${stderr.join("")}`
    );
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result;
}

function assertToolDescription(description, stderr) {
  if (typeof description !== "string") {
    throw new Error(`Installed mc_develop did not expose a text description.\n${stderr.join("")}`);
  }

  const requiredFragments = [
    "progressive",
    "downloadPolicy",
    "CURSEFORGE_API_KEY"
  ];
  for (const fragment of requiredFragments) {
    if (!description.includes(fragment)) {
      throw new Error(
        `Installed mc_develop description is missing ${fragment}.\n${stderr.join("")}`
      );
    }
  }

  const forbiddenFragments = ["@mcpskill/next", "@mcpskill/", "MCPSKILL_"];
  for (const fragment of forbiddenFragments) {
    if (description.includes(fragment)) {
      throw new Error(
        `Installed mc_develop description contains legacy fragment ${fragment}.\n${stderr.join("")}`
      );
    }
  }
}
