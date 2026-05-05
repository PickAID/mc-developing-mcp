import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { publishablePackages } from "./npm-publish-packages.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "mcpskill-install-smoke-"));
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

  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--fund=false",
    ...tarballs
  ], installRoot);

  await smokeInstalledBinary();
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

async function smokeInstalledBinary() {
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
      MCPSKILL_RUNTIME_ROOT: join(tempRoot, "runtime"),
      MCPSKILL_WORKSPACE_ROOT: installRoot
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
      clientInfo: { name: "mcpskill-install-smoke", version: "0.0.0" }
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

  await waitFor(() => responses.some((response) => response.id === 2), {
    stderr,
    getExitStatus: () => exitStatus
  });
  clearTimeout(timeout);
  child.kill();

  const initialize = responses.find((response) => response.id === 1);
  const tools = responses.find((response) => response.id === 2);

  if (initialize?.result?.serverInfo?.name !== "mc-developing-mcp") {
    throw new Error(`Installed MCP server did not initialize correctly.\n${stderr.join("")}`);
  }
  if (!tools?.result?.tools?.some((tool) => tool.name === "mc_develop")) {
    throw new Error(`Installed MCP server did not expose mc_develop.\n${stderr.join("")}`);
  }
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
