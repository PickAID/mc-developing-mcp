export interface JavaSourceSymbol {
  packageName?: string;
  simpleName: string;
  qualifiedName: string;
}

export interface JavaSourceMember {
  packageName?: string;
  ownerSimpleName: string;
  ownerQualifiedName: string;
  memberName: string;
  memberKind: "field" | "constructor" | "method";
  signature?: string;
  returnType?: string;
  startLine: number;
  endLine: number;
}

const PACKAGE_PATTERN = /^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m;
const TYPE_PATTERN =
  /^\s*(?:(?:public|protected|private|abstract|final|sealed|non-sealed|static)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)\b/gm;
const MODIFIERS = new Set([
  "public",
  "protected",
  "private",
  "static",
  "final",
  "abstract",
  "native",
  "synchronized",
  "transient",
  "volatile",
  "strictfp",
  "default"
]);

export function extractJavaSourceSymbols(text: string): JavaSourceSymbol[] {
  const packageName = text.match(PACKAGE_PATTERN)?.[1];
  const symbols: JavaSourceSymbol[] = [];

  for (const match of text.matchAll(TYPE_PATTERN)) {
    const simpleName = match[1];
    symbols.push({
      packageName,
      simpleName,
      qualifiedName: packageName ? `${packageName}.${simpleName}` : simpleName
    });
  }

  return symbols;
}

export function extractJavaSourceMembers(text: string): JavaSourceMember[] {
  const packageName = text.match(PACKAGE_PATTERN)?.[1];
  const masked = maskCommentsAndStrings(text);
  const lineStarts = buildLineStarts(text);
  const members: JavaSourceMember[] = [];

  for (const typeMatch of masked.matchAll(TYPE_PATTERN)) {
    const ownerSimpleName = typeMatch[1];
    const ownerQualifiedName = packageName
      ? `${packageName}.${ownerSimpleName}`
      : ownerSimpleName;
    const bodyStart = masked.indexOf("{", typeMatch.index ?? 0);
    if (bodyStart < 0) {
      continue;
    }

    const bodyEnd = findMatchingBrace(masked, bodyStart);
    if (bodyEnd < 0) {
      continue;
    }

    members.push(
      ...extractOwnerMembers({
        text,
        masked,
        lineStarts,
        packageName,
        ownerSimpleName,
        ownerQualifiedName,
        bodyStart,
        bodyEnd
      })
    );
  }

  return members;
}

interface OwnerMemberInput {
  text: string;
  masked: string;
  lineStarts: number[];
  packageName?: string;
  ownerSimpleName: string;
  ownerQualifiedName: string;
  bodyStart: number;
  bodyEnd: number;
}

function extractOwnerMembers(input: OwnerMemberInput): JavaSourceMember[] {
  const members: JavaSourceMember[] = [];
  let segmentStart = input.bodyStart + 1;
  let depth = 0;

  for (let index = input.bodyStart + 1; index < input.bodyEnd; index += 1) {
    const char = input.masked[index];
    if (char === "{" && depth === 0) {
      const header = input.masked.slice(segmentStart, index).trim();
      const member = parseCallableMember(input, header, segmentStart, index);
      if (member) {
        const bodyEnd = findMatchingBrace(input.masked, index);
        if (bodyEnd < 0) {
          break;
        }
        members.push(member);
        index = bodyEnd;
        segmentStart = index + 1;
      } else {
        depth += 1;
      }
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    } else if (char === ";" && depth === 0) {
      const statement = input.masked.slice(segmentStart, index).trim();
      const member = parseFieldMember(input, statement, segmentStart, index);
      if (member) {
        members.push(member);
      }
      segmentStart = index + 1;
    }
  }

  return members;
}

function parseCallableMember(
  input: OwnerMemberInput,
  header: string,
  startIndex: number,
  bodyOpenIndex: number
): JavaSourceMember | undefined {
  if (!header.includes("(") || header.includes("=")) {
    return undefined;
  }

  const normalized = normalizeHeader(header);
  const match = normalized.match(/^(.*?)\b([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?:throws\s+[\w$.,\s<>?]+)?$/s);
  if (!match) {
    return undefined;
  }

  const [, prefix, memberName, params] = match;
  const returnType = memberName === input.ownerSimpleName ? undefined : inferReturnType(prefix);
  if (memberName !== input.ownerSimpleName && !returnType) {
    return undefined;
  }

  const bodyEnd = findMatchingBrace(input.masked, bodyOpenIndex);
  const contentStart = firstContentIndex(input.masked, startIndex, bodyOpenIndex);
  return {
    packageName: input.packageName,
    ownerSimpleName: input.ownerSimpleName,
    ownerQualifiedName: input.ownerQualifiedName,
    memberName,
    memberKind: memberName === input.ownerSimpleName ? "constructor" : "method",
    signature: `${memberName}(${params.trim()})`,
    returnType,
    startLine: lineForIndex(input.lineStarts, contentStart),
    endLine: lineForIndex(input.lineStarts, bodyEnd < 0 ? bodyOpenIndex : bodyEnd)
  };
}

function parseFieldMember(
  input: OwnerMemberInput,
  statement: string,
  startIndex: number,
  endIndex: number
): JavaSourceMember | undefined {
  if (!statement || statement.includes("(")) {
    return undefined;
  }

  const normalized = normalizeHeader(statement);
  const lastDeclarator = normalized.split(",").at(-1)?.replace(/=.*/, "").trim();
  const match = lastDeclarator?.match(/^(.*\S)\s+([A-Za-z_$][\w$]*)$/s);
  if (!match) {
    return undefined;
  }

  const returnType = inferReturnType(match[1]);
  if (!returnType) {
    return undefined;
  }
  const contentStart = firstContentIndex(input.masked, startIndex, endIndex);

  return {
    packageName: input.packageName,
    ownerSimpleName: input.ownerSimpleName,
    ownerQualifiedName: input.ownerQualifiedName,
    memberName: match[2],
    memberKind: "field",
    signature: match[2],
    returnType,
    startLine: lineForIndex(input.lineStarts, contentStart),
    endLine: lineForIndex(input.lineStarts, endIndex)
  };
}

function inferReturnType(prefix: string): string | undefined {
  const tokens = prefix.trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && (MODIFIERS.has(tokens[0]) || tokens[0].startsWith("@"))) {
    tokens.shift();
  }
  return tokens.at(-1);
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\s*@[\w$.]+(?:\([^)]*\))?\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === "{") {
      depth += 1;
    } else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function firstContentIndex(text: string, startIndex: number, endIndex: number): number {
  for (let index = startIndex; index <= endIndex; index += 1) {
    if (/\S/.test(text[index] ?? "")) {
      return index;
    }
  }
  return startIndex;
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineForIndex(lineStarts: number[], index: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high + 1;
}

function maskCommentsAndStrings(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (match) =>
    match.replace(/[^\n]/g, " ")
  );
}
