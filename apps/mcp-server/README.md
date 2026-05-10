# minecraft-developing-mcp

MCP stdio server for Minecraft development assistance.

## Usage

```sh
npx -y --package minecraft-developing-mcp@latest mc-developing-mcp
```

For MCP client configuration, use the same command shape:

```json
{
  "command": "npx",
  "args": ["-y", "--package", "minecraft-developing-mcp@latest", "mc-developing-mcp"]
}
```

The package exposes the `mc-developing-mcp` binary and keeps the public MCP tool surface focused on `mc_develop`. Runtime evidence routes cover workspace detection, Gradle dependency evidence, Java diagnostics, local mod archives and nested JarJar archives, ProbeJS/KubeJS type evidence, datapack/resource-pack files, vanilla source acquisition, and optional offline documentation resources.

`structuredContent` includes top-level summaries for `workspacePreparation`, `crashSignals`, `javaDiagnostics`, `kubeJsQuality`, and `clientVisualVerifier`. MCP clients should use these fields as compact entry points, then follow detailed evidence blocks and suggested next-call patterns only when more context is needed.

Optional MDM resource packages are installed only when requested. Normal use starts with a discovery call and no download:

```json
{
  "requestText": "Check whether an offline docs/resource package would help this task."
}
```

If `structuredContent.resourceActions.actions` suggests a package and the user confirms the download, call `mc_develop` again with the suggested `inputPatch.mdmReleaseInstall` and `downloadPolicy: "allowed"`:

```json
{
  "requestText": "Install and use MDM docs/resources for this task.",
  "mdmReleaseInstall": {
    "manifestUrl": "https://github.com/PickAID/mdm-sources/releases/download/mdm-resources-v0.2.0/mdm-release-manifest.json",
    "packageId": "core-docs-search-sqlite",
    "downloadPolicy": "allowed"
  }
}
```

For normal use, first call `mc_develop` without `mdmReleaseInstall` and inspect `structuredContent.resourceActions.actions`. If a suggested action is appropriate, call again with its `inputPatch.mdmReleaseInstall` and change `downloadPolicy` from `disabled` to `allowed` after user confirmation. Installed artifacts are reused from the local runtime cache on later calls.

The npm package does not include MDM bundles. The `mdm-resources-v0.2.0` release uses channel bundles for datapack, resourcepack, mappings, and source-profile packages as transport and verification containers. The MCP downloads the bundle asset only after confirmation, verifies it, extracts the requested package member, and stores the package artifact in the local runtime cache.

External services that require credentials, such as CurseForge or ShaderToy API lookup, should be configured by the user at runtime. The package does not embed private API keys or generated private cache data.

This package requires Node.js `>=22.5.0` because runtime indexing and offline documentation paths use `node:sqlite`. It is published as one public npm package; internal workspace modules are bundled into the package and are not required as public npm dependencies.
