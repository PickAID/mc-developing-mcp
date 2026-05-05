# @mcpskill/mcp-server

MCP stdio server for Minecraft development assistance.

## Usage

```sh
npx -y --package @mcpskill/mcp-server mc-developing-mcp
```

For MCP client configuration, use the same command shape:

```json
{
  "command": "npx",
  "args": ["-y", "--package", "@mcpskill/mcp-server", "mc-developing-mcp"]
}
```

The package exposes the `mc-developing-mcp` binary and keeps the public MCP tool surface focused on `mc_develop`. Runtime evidence routes cover workspace detection, Gradle dependency evidence, Java diagnostics, local mod archives and nested JarJar archives, ProbeJS/KubeJS type evidence, datapack/resource-pack files, vanilla source acquisition, and optional offline documentation resources.

External services that require credentials, such as CurseForge or ShaderToy API lookup, should be configured by the user at runtime. The package does not embed private API keys or generated private cache data.

This package requires Node.js `>=18`. It is published as part of the `@mcpskill/*` package graph, so all internal runtime packages must be available from npm for `npx` installation to work.
