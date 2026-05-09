import { describe, expect, it } from "vitest";

import { buildHarnessTaskRoute } from "./task-route.js";
import {
  createTaskRouteFacts,
  createTaskRouteSnapshot
} from "./task-route-test-fixtures.js";

describe("buildHarnessTaskRoute crash triage", () => {
  it("routes crash triage requests to logs before external mods, source, and docs", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
            hasGradle: true,
            hasKubeJS: true,
            hasProbeJS: true,
            logPathCount: 2
          }
        }),
        "The pack crashes and latest.log shows a mixin exception."
      )
    ).toEqual({
      intent: {
        id: "crash_triage",
        confidence: "high",
        reasons: [
          "request text mentions crash or log-triage keywords",
          "workspace snapshot exposes log files for crash triage"
        ]
      },
      reasons: [
        "crash triage should inspect log files before source or docs"
      ],
      steps: [
        "log_files",
        "external_mod_resolution",
        "workspace_source",
        "docs_lookup"
      ],
      preferredTools: ["workspace.analyze", "context.query", "source.bundle"]
    });
  });

  it("adds mod archive content before external resolution for crash triage in modpacks", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
            hasModArchives: true,
            logPathCount: 1
          }
        }),
        "The server crashes in com.example.problem.CrashHandler."
      )
    ).toMatchObject({
      reasons: [
        "crash triage should inspect log files before source, mod jars, or docs"
      ],
      steps: [
        "log_files",
        "mod_archive_content",
        "external_mod_resolution",
        "workspace_source",
        "docs_lookup"
      ],
      preferredTools: ["workspace.analyze", "context.query", "source.bundle"]
    });
  });

  it("keeps OpenGL and resource crash report requests on log-first crash triage", () => {
    expect(
      buildHarnessTaskRoute(
        createTaskRouteSnapshot({
          workspaceKind: "modpack",
          routePlan: {
            scenario: "modpack-workspace",
            reasons: ["workspace descriptor reports a modpack workspace"],
            defaultRoutingScenario: "project_symbol",
            steps: ["workspace_source", "mod_archive_content", "docs_lookup"]
          },
          facts: {
            ...createTaskRouteFacts(),
            hasKubeJS: true,
            hasProbeJS: true,
            hasModArchives: true,
            hasResourcePack: true,
            logPathCount: 5
          }
        }),
        "诊断 crash-reports/crash-2026-04-04_03.28.58-fml.txt，使用本地 mod jar 与 crash report evidence 找出根因，说明 acceleratedrendering / OpenGL 版本要求。"
      )
    ).toMatchObject({
      intent: {
        id: "crash_triage",
        confidence: "high"
      },
      steps: [
        "log_files",
        "mod_archive_content",
        "external_mod_resolution",
        "workspace_source",
        "docs_lookup"
      ]
    });
  });
});
