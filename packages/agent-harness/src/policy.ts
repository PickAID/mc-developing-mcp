import type {
    AgentRuntimeAuthoringPolicy,
    WorkspaceBootstrapContext
} from "@mcpskill/shared-types";

export function buildHarnessAuthoringPolicy(
    workspaceContext?: WorkspaceBootstrapContext
): AgentRuntimeAuthoringPolicy | undefined {
    const descriptor = workspaceContext?.descriptor;

    if (!descriptor || (!descriptor.hasKubeJS && !descriptor.hasProbeJS)) {
        return undefined;
    }

    return {
        profile: "kubejs_script",
        runtimeModel: "minecraft_scripting",
        structureModel: "lifecycle_domain",
        preferredSignalOrder: [
            "probejs_types",
            "workspace_facts",
            "modding_docs"
        ],
        preferNamedFunctions: true,
        avoidGenericJavaScriptPatterns: true,
        allowPersistentConsole: false,
        requireExplicitDebugGate: true,
        preferDocBackedAnswers: true
    };
}

export function buildHarnessAuthoringPolicyFromBootstrap(input: {
    workspaceContext?: WorkspaceBootstrapContext;
}): AgentRuntimeAuthoringPolicy | undefined {
    return buildHarnessAuthoringPolicy(input.workspaceContext);
}
