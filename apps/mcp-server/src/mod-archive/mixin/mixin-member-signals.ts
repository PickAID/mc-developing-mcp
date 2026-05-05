export type MixinMemberKind = "field" | "constructor" | "method";

export interface MixinMemberReference {
  owner: string;
  memberName: string;
  memberKind: MixinMemberKind;
  descriptor?: string;
}

const MAX_MEMBER_REFERENCES = 16;

export function extractMixinMemberReferences(
  requestText: string | undefined
): MixinMemberReference[] {
  if (!requestText) {
    return [];
  }

  return uniqueMemberReferences([
    ...extractJvmTargetMembers(requestText),
    ...extractNoSuchMethodMembers(requestText),
    ...extractNoSuchFieldMembers(requestText)
  ]).slice(0, MAX_MEMBER_REFERENCES);
}

function extractJvmTargetMembers(content: string): MixinMemberReference[] {
  const matches = content.matchAll(
    /\b(?:target|method|field)\s*=\s*L((?:[A-Za-z_$][\w$]*\/)+[A-Za-z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*);([A-Za-z_$<][\w$<>]*)(\([^)]*\)[\w$./;[\]ZBCSIJFDV]+|:[\w$./;[\]ZBCSIJFD]+)?/g
  );

  return [...matches].flatMap((match) => {
    const owner = normalizeOwner(match[1]);
    const memberName = normalizeMemberName(match[2]);
    if (!owner || !memberName) {
      return [];
    }

    return [{
      owner,
      memberName,
      memberKind: memberName === "<init>"
        ? "constructor"
        : (match[3]?.startsWith(":") ? "field" : "method"),
      descriptor: match[3]
    }];
  });
}

function extractNoSuchMethodMembers(content: string): MixinMemberReference[] {
  const matches = content.matchAll(
    /\bNoSuchMethodError:\s+(?:'[^']*?\s+)?((?:[a-z_][\w$]*\.){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*)[.#]([A-Za-z_$<][\w$<>]*)\s*\(/g
  );

  return [...matches].flatMap((match) => {
    const owner = normalizeOwner(match[1]);
    const memberName = normalizeMemberName(match[2]);
    return owner && memberName
      ? [{ owner, memberName, memberKind: memberName === "<init>" ? "constructor" : "method" }]
      : [];
  });
}

function extractNoSuchFieldMembers(content: string): MixinMemberReference[] {
  const matches = content.matchAll(
    /\bNoSuchFieldError:\s+(?:'[^']*?\s+)?((?:[a-z_][\w$]*\.){2,}[A-Z_$][\w$]*(?:\$[A-Za-z_$][\w$]*)*)[.#]([A-Za-z_$][\w$]*)\b/g
  );

  return [...matches].flatMap((match) => {
    const owner = normalizeOwner(match[1]);
    const memberName = normalizeMemberName(match[2]);
    return owner && memberName
      ? [{ owner, memberName, memberKind: "field" }]
      : [];
  });
}

function normalizeOwner(value: string | undefined): string | undefined {
  const normalized = value?.trim().replaceAll("/", ".");
  return normalized && normalized.includes(".") ? normalized : undefined;
}

function normalizeMemberName(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function uniqueMemberReferences(
  references: MixinMemberReference[]
): MixinMemberReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = [
      reference.owner,
      reference.memberName,
      reference.memberKind,
      reference.descriptor ?? ""
    ].join("#");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
