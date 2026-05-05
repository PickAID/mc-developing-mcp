import { describe, expect, it } from "vitest";

import type {
    CurrentRuntime,
    WorkspaceBootstrapContext,
    WorkspaceDescriptor
} from "@mcpskill/shared-types";

import {
    buildHarnessAuthoringPolicy,
    buildHarnessAuthoringPolicyFromBootstrap
} from "./policy.js";

describe("buildHarnessAuthoringPolicy", () => {
    it("returns undefined when no KubeJS signals are available", () => {
        expect(buildHarnessAuthoringPolicy()).toBeUndefined();
    });

    it("returns a KubeJS-first authoring policy for KubeJS workspaces", () => {
        expect(
            buildHarnessAuthoringPolicy(
                createWorkspaceContext({
                    kind: "kubejs",
                    hasKubeJS: true,
                    hasProbeJS: true,
                    hasDatapack: true
                })
            )
        ).toEqual({
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
        });
    });

    it("keeps the same KubeJS policy available inside mixed modpack workspaces", () => {
        expect(
            buildHarnessAuthoringPolicyFromBootstrap({
                workspaceContext: createWorkspaceContext({
                    kind: "modpack",
                    hasGradle: true,
                    hasKubeJS: true,
                    hasProbeJS: true
                })
            })
        ).toMatchObject({
            profile: "kubejs_script",
            preferredSignalOrder: [
                "probejs_types",
                "workspace_facts",
                "modding_docs"
            ]
        });
    });
});

function createWorkspaceContext(
    overrides: Partial<WorkspaceDescriptor>
): WorkspaceBootstrapContext {
    const descriptor: WorkspaceDescriptor = {
        root: "/tmp/workspace",
        kind: "unknown",
        hasGradle: false,
        hasKubeJS: false,
        hasProbeJS: false,
        hasModArchives: false,
        hasJavaSource: false,
        hasDatapack: false,
        buildFiles: [],
        javaSourceRoots: [],
        modArchivePaths: [],
        datapackRoots: [],
        logPaths: [],
        reasons: [],
        currentRuntime: createCurrentRuntime(),
        ...overrides
    };

    return {
        workspaceRoot: descriptor.root,
        detectorPackage: "@mcpskill/workspace-detector",
        descriptor
    };
}

function createCurrentRuntime(): CurrentRuntime {
    return {
        source: "unknown",
        confidence: "unknown",
        evidenceSources: [],
        candidates: [],
        evidence: []
    };
}
