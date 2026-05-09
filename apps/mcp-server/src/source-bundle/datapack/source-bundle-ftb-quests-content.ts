import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_SCANNED_FILES = 32;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_LIST_ITEMS = 24;

export interface FtbQuestsContentSummary {
  source: "ftb_quests_compact_content";
  scannedFileCount: number;
  questCount: number;
  taskCount: number;
  rewardCount: number;
  typeRefs: string[];
  itemRefs: string[];
  topQuestIds: string[];
  topTaskIds: string[];
  topRewardIds: string[];
  truncated: boolean;
}

export async function summarizeFtbQuestsContent(input: {
  workspaceRoot: string;
  paths: string[];
}): Promise<FtbQuestsContentSummary | undefined> {
  const paths = input.paths.slice(0, MAX_SCANNED_FILES);
  const accumulator = createAccumulator();

  for (const path of paths) {
    const content = await readSnbtPrefix(input.workspaceRoot, path);
    if (!content) {
      continue;
    }

    accumulator.scannedFileCount += 1;
    collectSectionIds(content, "quests", accumulator.questIds);
    collectSectionIds(content, "tasks", accumulator.taskIds);
    collectSectionIds(content, "rewards", accumulator.rewardIds);
    collectFieldValues(content, "type", accumulator.typeRefs);
    collectFieldValues(content, "item", accumulator.itemRefs);
  }

  if (accumulator.scannedFileCount === 0) {
    return undefined;
  }

  return {
    source: "ftb_quests_compact_content",
    scannedFileCount: accumulator.scannedFileCount,
    questCount: accumulator.questIds.size,
    taskCount: accumulator.taskIds.size,
    rewardCount: accumulator.rewardIds.size,
    typeRefs: sortedLimited(accumulator.typeRefs),
    itemRefs: sortedLimited(accumulator.itemRefs),
    topQuestIds: sortedLimited(accumulator.questIds),
    topTaskIds: sortedLimited(accumulator.taskIds),
    topRewardIds: sortedLimited(accumulator.rewardIds),
    truncated: input.paths.length > paths.length
  };
}

function createAccumulator() {
  return {
    scannedFileCount: 0,
    questIds: new Set<string>(),
    taskIds: new Set<string>(),
    rewardIds: new Set<string>(),
    typeRefs: new Set<string>(),
    itemRefs: new Set<string>()
  };
}

async function readSnbtPrefix(
  workspaceRoot: string,
  relativePath: string
): Promise<string | undefined> {
  try {
    const content = await readFile(join(workspaceRoot, relativePath), "utf-8");
    return content.slice(0, MAX_FILE_BYTES);
  } catch {
    return undefined;
  }
}

function collectSectionIds(
  content: string,
  section: "quests" | "tasks" | "rewards",
  target: Set<string>
): void {
  const sectionPattern = new RegExp(
    `${section}\\s*:\\s*\\[\\s*\\{\\s*id\\s*:\\s*"([^"]+)"`,
    "gu"
  );
  for (const match of content.matchAll(sectionPattern)) {
    const value = match[1]?.trim();
    if (value) {
      target.add(value);
    }
  }
}

function collectFieldValues(
  content: string,
  field: "id" | "item" | "type",
  target: Set<string>
): void {
  const fieldPattern = new RegExp(`${field}\\s*:\\s*"([^"]+)"`, "gu");
  for (const match of content.matchAll(fieldPattern)) {
    const value = match[1]?.trim();
    if (value) {
      target.add(value);
    }
  }
}

function sortedLimited(values: Set<string>): string[] {
  return [...values].sort().slice(0, MAX_LIST_ITEMS);
}
