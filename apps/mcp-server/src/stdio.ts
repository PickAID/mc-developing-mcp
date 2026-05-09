#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  createMcpSkillServer,
  type McpSkillServerOptions
} from "./core/server/mcp-server.js";
import { MCP_SERVER_VERSION } from "./core/metadata/server-metadata.js";

export async function runMcpServerStdio(
  options: McpSkillServerOptions = {}
): Promise<void> {
  const server = createMcpSkillServer(options);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

function isDirectRun(moduleUrl: string): boolean {
  const entrypoint = process.argv[1];

  return entrypoint
    ? pathToFileURL(realpathSync(resolve(entrypoint))).href === moduleUrl
    : false;
}

if (isDirectRun(import.meta.url)) {
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(MCP_SERVER_VERSION);
  } else {
    runMcpServerStdio().catch((error: unknown) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);

      console.error(message);
      process.exitCode = 1;
    });
  }
}
