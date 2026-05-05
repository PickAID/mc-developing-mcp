#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  createMcpSkillServer,
  type McpSkillServerOptions
} from "./core/server/mcp-server.js";

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
    ? pathToFileURL(resolve(entrypoint)).href === moduleUrl
    : false;
}

if (isDirectRun(import.meta.url)) {
  runMcpServerStdio().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);

    console.error(message);
    process.exitCode = 1;
  });
}
