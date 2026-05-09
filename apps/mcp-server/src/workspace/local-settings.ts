import { readFile } from "node:fs/promises";
import { join, sep } from "node:path";

export interface WorkspaceLocalSchemaExtension {
  id: string;
  category: string;
  paths: string[];
}

export interface WorkspaceLocalSettings {
  source: "workspace_local_settings";
  path: WorkspaceLocalSettingsPath;
  ftbQuests: {
    schemaExtensions: WorkspaceLocalSchemaExtension[];
  };
}

export type WorkspaceLocalSettingsPath =
  | ".mc-developing-mcp/settings.json"
  | ".mcpskill/settings.json";

const primarySettingsPath = ".mc-developing-mcp/settings.json" as const;
const legacySettingsPath = ".mcpskill/settings.json" as const;

export async function readWorkspaceLocalSettings(
  workspaceRoot: string
): Promise<WorkspaceLocalSettings> {
  const primary = await tryReadWorkspaceLocalSettings(
    workspaceRoot,
    primarySettingsPath
  );
  if (primary !== undefined) {
    return primary;
  }

  const legacy = await tryReadWorkspaceLocalSettings(
    workspaceRoot,
    legacySettingsPath
  );
  if (legacy !== undefined) {
    return legacy;
  }

  return buildWorkspaceLocalSettings(primarySettingsPath, undefined);
}

async function tryReadWorkspaceLocalSettings(
  workspaceRoot: string,
  settingsPath: WorkspaceLocalSettingsPath
): Promise<WorkspaceLocalSettings | undefined> {
  try {
    const raw = await readFile(
      resolveWorkspaceLocalSettingsPath(workspaceRoot, settingsPath),
      "utf-8"
    );
    const parsed = JSON.parse(raw) as {
      ftbQuests?: { schemaExtensions?: unknown };
    };

    return buildWorkspaceLocalSettings(
      settingsPath,
      parsed.ftbQuests?.schemaExtensions
    );
  } catch {
    return undefined;
  }
}

function resolveWorkspaceLocalSettingsPath(
  workspaceRoot: string,
  settingsPath: WorkspaceLocalSettingsPath
): string {
  return join(workspaceRoot, ...settingsPath.split("/"));
}

function buildWorkspaceLocalSettings(
  settingsPath: WorkspaceLocalSettingsPath,
  ftbQuestsSchemaExtensions: unknown
): WorkspaceLocalSettings {
  return {
    source: "workspace_local_settings",
    path: settingsPath,
    ftbQuests: {
      schemaExtensions: parseLocalSchemaExtensions(ftbQuestsSchemaExtensions)
    }
  };
}

function parseLocalSchemaExtensions(
  value: unknown
): WorkspaceLocalSchemaExtension[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const id = typeof entry.id === "string" ? entry.id : "";
    const category = typeof entry.category === "string" ? entry.category : "";
    const paths = Array.isArray(entry.paths)
      ? entry.paths.filter((path): path is string => typeof path === "string")
      : [];

    if (!safeIdentifier(id) || !safeIdentifier(category) || paths.length === 0) {
      return [];
    }

    return [{ id, category, paths: paths.map(normalizeLocalPathPrefix) }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeIdentifier(value: string): boolean {
  return /^[a-z0-9_.-]+$/i.test(value);
}

function normalizeLocalPathPrefix(path: string): string {
  return path.split(sep).join("/").replace(/^\/+|\/+$/g, "");
}
