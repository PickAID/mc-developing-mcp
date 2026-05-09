import type {
  WorkspaceLocalSchemaExtension,
  WorkspaceLocalSettingsPath
} from "../../workspace/local-settings.js";

export interface FtbQuestsSettingsProposal {
  targetPath: WorkspaceLocalSettingsPath;
  mode: "manual_review_only";
  reason: string;
  proposedJson: {
    ftbQuests: {
      schemaExtensions: WorkspaceLocalSchemaExtension[];
    };
  };
  requiredBeforeWrite: string[];
}

export function buildFtbQuestsSettingsProposal(input: {
  targetPath: WorkspaceLocalSettingsPath;
  schemaExtensions: WorkspaceLocalSchemaExtension[];
}): FtbQuestsSettingsProposal | undefined {
  if (input.schemaExtensions.length === 0) {
    return undefined;
  }

  return {
    targetPath: input.targetPath,
    mode: "manual_review_only",
    reason:
      "FTB Quests log errors suggest reusable schema categories, but user verification is required before writing.",
    proposedJson: {
      ftbQuests: {
        schemaExtensions: input.schemaExtensions
      }
    },
    requiredBeforeWrite: [
      "confirm the edited quest files load in-game",
      "confirm this directory is reusable pack schema, not one broken file"
    ]
  };
}
