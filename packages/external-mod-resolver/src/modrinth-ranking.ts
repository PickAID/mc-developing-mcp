export interface ModrinthProjectIdentity {
  project_id: string;
  slug: string;
  title: string;
}

export function chooseStrongModrinthProjectMatch<
  T extends ModrinthProjectIdentity
>(hits: readonly T[], query: string): T | undefined {
  const normalizedQuery = normalizeProjectSearchText(query);
  const exactProjectId = query.trim().toLowerCase();

  return (
    hits.find((hit) => hit.project_id.toLowerCase() === exactProjectId) ??
    hits.find((hit) => normalizeProjectSearchText(hit.slug) === normalizedQuery) ??
    hits.find((hit) => normalizeProjectSearchText(hit.title) === normalizedQuery)
  );
}

function normalizeProjectSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
