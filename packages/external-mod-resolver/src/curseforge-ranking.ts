export interface CurseForgeProjectIdentity {
  id: number;
  slug: string;
  name: string;
}

export function chooseStrongCurseForgeProjectMatch<
  T extends CurseForgeProjectIdentity
>(projects: readonly T[], query: string | undefined): T | undefined {
  const exactProjectId = query?.trim();
  const normalizedQuery = normalizeProjectSearchText(query ?? "");

  if (!exactProjectId || !normalizedQuery) {
    return undefined;
  }

  return (
    projects.find((project) => String(project.id) === exactProjectId) ??
    projects.find((project) =>
      normalizeProjectSearchText(project.slug) === normalizedQuery
    ) ??
    projects.find((project) =>
      normalizeProjectSearchText(project.name) === normalizedQuery
    )
  );
}

function normalizeProjectSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
