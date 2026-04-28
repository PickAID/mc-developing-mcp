import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  registerMcpServerTools,
  type McpDevelopToolInput,
  type McpToolRuntimeOptions
} from "./mcp-tools.js";

export interface McpSkillServerOptions extends McpToolRuntimeOptions {
  name?: string;
  version?: string;
}

export function createMcpSkillServer(
  options: McpSkillServerOptions = {}
): McpServer {
  const server = new McpServer({
    name: options.name ?? "mc-developing-mcp",
    version: options.version ?? "0.1.0"
  });

  registerMcpServerTools(
    {
      registerTool(name, config, handler) {
        return server.registerTool(name, config, (input) =>
          handler(input as McpDevelopToolInput)
        );
      }
    },
    options
  );

  return server;
}
