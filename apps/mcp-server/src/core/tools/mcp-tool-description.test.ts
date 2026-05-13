import { describe, expect, it } from "vitest";

import { buildMcpDevelopToolDescription } from "./mcp-tool-description.js";
import { mcpDevelopInputShape } from "./mcp-tools.js";

describe("mc_develop tool description", () => {
  it("explains progressive route decisions and follow-up policies", () => {
    const description = buildMcpDevelopToolDescription();

    expect(description).toContain("workspace_gradle");
    expect(description).toContain("workspace_probejs");
    expect(description).toContain("runtime_cache");
    expect(description).toContain("local_jar");
    expect(description).toContain("official");
    expect(description).toContain("modrinth");
    expect(description).toContain("curseforge");
    expect(description).toContain("github");
    expect(description).toContain("Runtime environment resolution is layered");
    expect(description).toContain("mdmSourcesRoot");
    expect(description).toContain("runtimeEnvironment");
    expect(description).toContain("inputPatch/envPatch");
    expect(description).toContain("remoteMetadataPolicy: enabled");
    expect(description).toContain("https://github.com/neoforged/.github/tree/main/primers");
    expect(description).toContain("https://misode.github.io/versions/?id=26.1&tab=changelog");
    expect(description).toContain("CURSEFORGE_API_KEY");
    expect(description).toContain("includeDefaultGradleUserHome: true");
    expect(description).toContain("localJarMode: prewarm_entry_index");
    expect(description).toContain("crashSignals");
    expect(description).toContain("javaDiagnostics");
    expect(description).toContain("kubeJsQuality");
    expect(description).toContain("clientVisualVerifier");
    expect(description).toContain("workspacePreparation");
  });

  it("documents route and policy schema with concrete usage hints", () => {
    expect(mcpDevelopInputShape.preparationRoutes.description).toContain(
      "workspace_gradle"
    );
    expect(mcpDevelopInputShape.preparationRoutes.description).toContain(
      "workspace_probejs"
    );
    expect(mcpDevelopInputShape.preparationRoutes.description).toContain(
      "local_jar"
    );
    expect(mcpDevelopInputShape.preparationRoutes.description).toContain(
      "modrinth"
    );
    expect(mcpDevelopInputShape.preparationPolicy.description).toContain(
      "remoteMetadataPolicy: enabled"
    );
    expect(mcpDevelopInputShape.preparationPolicy.description).toContain(
      "localJarMode: prewarm_entry_index"
    );
    expect(mcpDevelopInputShape.gradleSourceDiscovery.description).toContain(
      "includeDefaultGradleUserHome: true"
    );
    expect(mcpDevelopInputShape.mdmSourcesRoot.description).toContain(
      "MDM_SOURCES_ROOT"
    );
    expect(mcpDevelopInputShape.mdmSourcesRoot.description).toContain(
      "~/.local/share/mc-developing-mcp/mdm-sources"
    );
  });
});
