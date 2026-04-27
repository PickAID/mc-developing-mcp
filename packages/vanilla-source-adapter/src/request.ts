export interface VanillaSourceRequest {
  symbol?: string;
  packageHint?: string;
  relativePath?: string;
  maxFiles?: number;
}

export function isVanillaSourceRequest(request: VanillaSourceRequest): boolean {
  return (
    startsWithVanillaPrefix(request.symbol) ||
    startsWithVanillaPrefix(request.packageHint) ||
    startsWithVanillaRelativePath(request.relativePath)
  );
}

export function deriveVanillaRelativePath(
  request: VanillaSourceRequest
): string | undefined {
  if (request.relativePath && startsWithVanillaRelativePath(request.relativePath)) {
    return normalizeRelativePath(request.relativePath);
  }

  if (request.symbol && startsWithVanillaPrefix(request.symbol)) {
    return `${request.symbol.replaceAll(".", "/")}.java`;
  }

  return undefined;
}

export function deriveVanillaFileName(
  request: VanillaSourceRequest
): string | undefined {
  const relativePath = deriveVanillaRelativePath(request);

  if (relativePath) {
    const segments = relativePath.split("/");

    return segments.at(-1);
  }

  if (!request.symbol || !startsWithVanillaPrefix(request.symbol)) {
    return undefined;
  }

  const segments = request.symbol.split(".");

  return `${segments.at(-1)}.java`;
}

function startsWithVanillaPrefix(value?: string): boolean {
  return value?.startsWith("net.minecraft.") ?? false;
}

function startsWithVanillaRelativePath(value?: string): boolean {
  return normalizeRelativePath(value).startsWith("net/minecraft/");
}

function normalizeRelativePath(value?: string): string {
  return value?.replaceAll("\\", "/") ?? "";
}
