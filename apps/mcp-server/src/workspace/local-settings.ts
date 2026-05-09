import { readFile } from "node:fs/promises";
import { join, sep } from "node:path";

export interface WorkspaceLocalSchemaExtension {
  id: string;
  category: string;
  paths: string[];
}

export interface WorkspaceLocalSettings {
  source: "workspace_local_settings";
  path: ".mcpskill/settings.json";
  ftbQuests: {
    schemaExtensions: WorkspaceLocalSchemaExtension[];
  };
}

export async function readWorkspaceLocalSettings(
  workspaceRoot: string
): Promise<WorkspaceLocalSettings> {
  try {
    const raw = await readFile(resolveWorkspaceLocalSettingsPath(workspaceRoot), "utf-8");
    const parsed = JSON.parse(raw) as {
      ftbQuests?: { schemaExtensions?: unknown };
    };

    return buildWorkspaceLocalSettings(parsed.ftbQuests?.schemaExtensions);
  } catch {
    return buildWorkspaceLocalSettings(undefined);
  }
}

function resolveWorkspaceLocalSettingsPath(workspaceRoot: string): string {
  return join(workspaceRoot, ".mcpskill", "settings.json");
}

function buildWorkspaceLocalSettings(
  ftbQuestsSchemaExtensions: unknown
): WorkspaceLocalSettings {
  return {
    source: "workspace_local_settings",
    path: ".mcpskill/settings.json",
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
