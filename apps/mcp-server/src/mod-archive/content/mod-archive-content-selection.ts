import {
  MOD_ARCHIVE_SEARCH_DOMAINS
} from "./mod-archive-content-query.js";

export function buildEmptyPayload(queries: string[], archiveCount: number) {
  return {
    source: "mod_archive_content",
    domains: MOD_ARCHIVE_SEARCH_DOMAINS,
    queries,
    archiveCount,
    searchedArchives: 0,
    matches: [],
    skipped: [],
    truncated: false
  };
}

export function selectArchive(
  archives: Array<{ archivePath: string; relativePath: string }>,
  requestText?: string
): { archivePath: string; relativePath: string } | undefined {
  if (archives.length === 1) {
    return archives[0];
  }
  if (!requestText) {
    return undefined;
  }

  const normalizedText = requestText.toLowerCase();
  return archives.find((archive) => {
    const archivePath = archive.archivePath.toLowerCase();
    const relativePath = archive.relativePath.toLowerCase();
    const archiveName = relativePath.split("/").at(-1) ?? relativePath;
    return (
      normalizedText.includes(archivePath) ||
      normalizedText.includes(relativePath) ||
      normalizedText.includes(archiveName)
    );
  });
}
