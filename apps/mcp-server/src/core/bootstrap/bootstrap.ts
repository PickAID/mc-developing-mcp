import type {
    McpServerBootstrap,
    McpServerBootstrapOptions,
    WorkspaceBootstrapContext,
    WorkspaceBootstrapInput,
} from "minecraft-developing-mcp-shared-types";
import { createDefaultRuntimePolicy } from "minecraft-developing-mcp-runtime-manager";
import {
    detectWorkspace,
    WORKSPACE_DETECTOR_PACKAGE,
} from "minecraft-developing-mcp-workspace-detector";

export function buildMcpServerBootstrap(
    runtimeRoot: string,
): McpServerBootstrap;
export function buildMcpServerBootstrap(
    options: McpServerBootstrapOptions,
): Promise<McpServerBootstrap>;
export function buildMcpServerBootstrap(
    input: string | McpServerBootstrapOptions,
): McpServerBootstrap | Promise<McpServerBootstrap> {
    if (typeof input === "string") {
        return createBaseBootstrap(input);
    }

    if (!input.workspace) {
        return Promise.resolve(createBaseBootstrap(input.runtimeRoot));
    }

    return buildWorkspaceContext(input.workspace).then((workspaceContext) => ({
        ...createBaseBootstrap(input.runtimeRoot),
        workspaceContext,
    }));
}

function createBaseBootstrap(runtimeRoot: string): McpServerBootstrap {
    return {
        appId: "mcp-server",
        runtimePolicy: createDefaultRuntimePolicy(runtimeRoot),
        corePackages: [
            "minecraft-developing-mcp-agent-harness",
            "minecraft-developing-mcp-runtime-manager",
            "minecraft-developing-mcp-shared-types",
            "minecraft-developing-mcp-workspace-detector",
        ],
    };
}

async function buildWorkspaceContext(
    workspace: WorkspaceBootstrapInput | undefined,
): Promise<WorkspaceBootstrapContext | undefined> {
    if (!workspace) {
        return undefined;
    }

    const descriptor = await detectWorkspace(workspace.workspaceRoot, {
        prismRoot: workspace.prismRoot,
    });

    return {
        workspaceRoot: workspace.workspaceRoot,
        prismRoot: workspace.prismRoot,
        detectorPackage: WORKSPACE_DETECTOR_PACKAGE,
        descriptor,
    };
}
