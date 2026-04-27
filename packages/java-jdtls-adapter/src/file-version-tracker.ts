export interface JavaFileVersionTracker {
  open(filePath: string): number;
  change(filePath: string): number;
  current(filePath: string): number | undefined;
  close(filePath: string): void;
  clear(): void;
}

export function createJavaFileVersionTracker(): JavaFileVersionTracker {
  const versions = new Map<string, number>();

  return {
    open(filePath) {
      versions.set(filePath, 1);
      return 1;
    },

    change(filePath) {
      const nextVersion = (versions.get(filePath) ?? 0) + 1;
      versions.set(filePath, nextVersion);
      return nextVersion;
    },

    current(filePath) {
      return versions.get(filePath);
    },

    close(filePath) {
      versions.delete(filePath);
    },

    clear() {
      versions.clear();
    }
  };
}
