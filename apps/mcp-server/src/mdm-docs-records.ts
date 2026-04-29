import {
  readMdmDocsResourceRecords,
  type DocsPackageRecord
} from "@mcpskill/docs-retrieval";

import type { MdmResourceStatusContext } from "./mdm-resource-status.js";

export async function loadMdmDocsRecordsFromStatus(
  context: MdmResourceStatusContext
): Promise<DocsPackageRecord[]> {
  if (context.status !== "available") {
    return [];
  }

  const artifactPaths = (context.summary?.packages ?? [])
    .filter((resourcePackage) => resourcePackage.status === "ready")
    .map((resourcePackage) => resourcePackage.artifactPath)
    .filter((path): path is string => Boolean(path));
  const settled = await Promise.all(
    artifactPaths.map((path) => readMdmDocsResourceRecords(path).catch(() => []))
  );

  return settled.flat();
}
