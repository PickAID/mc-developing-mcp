import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  registerMcpServerTools,
  type McpDevelopToolInput,
  type McpToolRuntimeOptions
} from "../tools/mcp-tools.js";
import {
  createMcpJavaDiagnosticsRuntime,
  type McpJavaDiagnosticsRuntime
} from "../../java/diagnostics/java-diagnostics-runtime.js";

export interface McpSkillServerOptions extends McpToolRuntimeOptions {
  name?: string;
  version?: string;
}

export function createMcpSkillServer(
  options: McpSkillServerOptions = {}
): McpServer {
  const javaDiagnosticsRuntime =
    options.javaDiagnosticsRuntime ??
    createMcpJavaDiagnosticsRuntime({
      env: options.env as NodeJS.ProcessEnv | undefined
    });
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
    { ...options, javaDiagnosticsRuntime }
  );
  bindJavaDiagnosticsRuntimeLifecycle(server, javaDiagnosticsRuntime);

  return server;
}

function bindJavaDiagnosticsRuntimeLifecycle(
  server: McpServer,
  javaDiagnosticsRuntime: McpJavaDiagnosticsRuntime
): void {
  const closeServer = server.close.bind(server);
  let closePromise: Promise<void> | undefined;

  server.close = () => {
    closePromise ??= (async () => {
      try {
        await closeServer();
      } finally {
        await javaDiagnosticsRuntime.stopAll();
      }
    })();
    return closePromise;
  };
}
