export interface FtbQuestsDecisionTrace {
  priorityOrder: [
    "workspace_settings",
    "builtin_schema_fallback",
    "workspace_log_signals",
    "manual_settings_proposal"
  ];
  activeSchemaSource: "workspace_settings" | "builtin_schema_fallback";
  nextAction: string;
}

export function buildFtbQuestsDecisionTrace(input: {
  hasWorkspaceSchema: boolean;
  hasSettingsProposal: boolean;
}): FtbQuestsDecisionTrace {
  return {
    priorityOrder: [
      "workspace_settings",
      "builtin_schema_fallback",
      "workspace_log_signals",
      "manual_settings_proposal"
    ],
    activeSchemaSource: input.hasWorkspaceSchema
      ? "workspace_settings"
      : "builtin_schema_fallback",
    nextAction: input.hasSettingsProposal
      ? "review settingsProposal, test in-game, then update .mc-developing-mcp/settings.json only if verified"
      : "use workspace settings when present; otherwise treat builtin schema as fallback evidence"
  };
}
