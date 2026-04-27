export interface DisposableKubeJsLanguageProject {
  dispose(): void;
}

export interface KubeJsLanguageServiceCacheOptions {
  maxEntries?: number;
}

export interface KubeJsLanguageServiceCache<T extends DisposableKubeJsLanguageProject> {
  getOrCreate(key: string, create: () => T): T;
  size(): number;
  clear(): void;
}

export function createKubeJsLanguageServiceCache<
  T extends DisposableKubeJsLanguageProject
>(
  options: KubeJsLanguageServiceCacheOptions = {}
): KubeJsLanguageServiceCache<T> {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 4));
  const projects = new Map<string, T>();

  return {
    getOrCreate(key, create) {
      const existing = projects.get(key);
      if (existing) {
        projects.delete(key);
        projects.set(key, existing);
        return existing;
      }

      const project = create();
      projects.set(key, project);
      evictOverflow(projects, maxEntries);

      return project;
    },

    size() {
      return projects.size;
    },

    clear() {
      for (const project of projects.values()) {
        project.dispose();
      }
      projects.clear();
    }
  };
}

function evictOverflow<T extends DisposableKubeJsLanguageProject>(
  projects: Map<string, T>,
  maxEntries: number
): void {
  while (projects.size > maxEntries) {
    const oldestKey = projects.keys().next().value as string | undefined;
    if (oldestKey === undefined) {
      return;
    }

    const oldest = projects.get(oldestKey);
    projects.delete(oldestKey);
    oldest?.dispose();
  }
}
