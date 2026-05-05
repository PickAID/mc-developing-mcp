export type AccessWidenerVersion = "v1" | "v2";
export type AccessWidenerAccess = "accessible" | "extendable" | "mutable";
export type AccessWidenerTargetKind = "class" | "method" | "field";

export interface AccessWidenerHeader {
  version: AccessWidenerVersion;
  namespace: string;
}

export interface AccessWidenerClassTarget {
  kind: "class";
  access: AccessWidenerAccess;
  transitive: boolean;
  owner: string;
}

export interface AccessWidenerMemberTarget {
  kind: "method" | "field";
  access: AccessWidenerAccess;
  transitive: boolean;
  owner: string;
  name: string;
  descriptor: string;
}

export type AccessWidenerTarget =
  | AccessWidenerClassTarget
  | AccessWidenerMemberTarget;

export interface AccessWidenerDiagnostic {
  line: number;
  message: string;
}

export interface ParseAccessWidenerTargetsResult {
  header?: AccessWidenerHeader;
  targets: AccessWidenerTarget[];
  diagnostics: AccessWidenerDiagnostic[];
}

const ACCESS_MODIFIERS = new Set(["accessible", "extendable", "mutable"]);

export function parseAccessWidenerTargets(
  content: string
): ParseAccessWidenerTargetsResult {
  const targets: AccessWidenerTarget[] = [];
  const diagnostics: AccessWidenerDiagnostic[] = [];
  let header: AccessWidenerHeader | undefined;
  let sawHeader = false;

  content.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = stripComment(rawLine).trim();
    if (!line) {
      return;
    }

    if (!sawHeader) {
      sawHeader = true;
      const parsedHeader = parseHeader(line);
      if (parsedHeader) {
        header = parsedHeader;
      } else {
        diagnostics.push({
          line: lineNumber,
          message: "Expected accessWidener v1/v2 header"
        });
      }
      return;
    }

    const parsedTarget = parseTarget(line, lineNumber);
    if (parsedTarget.target) {
      targets.push(parsedTarget.target);
    }
    if (parsedTarget.diagnostic) {
      diagnostics.push(parsedTarget.diagnostic);
    }
  });

  return { header, targets, diagnostics };
}

function parseHeader(line: string): AccessWidenerHeader | undefined {
  const parts = line.split(/\s+/);
  if (parts.length !== 3 || parts[0] !== "accessWidener") {
    return undefined;
  }
  if (parts[1] !== "v1" && parts[1] !== "v2") {
    return undefined;
  }
  return {
    version: parts[1],
    namespace: parts[2]
  };
}

function parseTarget(
  line: string,
  lineNumber: number
): { target?: AccessWidenerTarget; diagnostic?: AccessWidenerDiagnostic } {
  const parts = line.split(/\s+/);
  const access = parseAccess(parts[0]);
  if (!access) {
    return diagnostic(lineNumber, "Unsupported access widener modifier");
  }

  const kind = parts[1];
  if (kind === "class") {
    if (!isAccessAllowedForKind(access.access, kind)) {
      return diagnostic(lineNumber, "Unsupported access widener modifier for target kind");
    }
    if (parts.length !== 3) {
      return diagnostic(lineNumber, "Expected class target: <access> class <owner>");
    }
    return {
      target: {
        kind,
        access: access.access,
        transitive: access.transitive,
        owner: parts[2]
      }
    };
  }

  if (kind === "method" || kind === "field") {
    if (!isAccessAllowedForKind(access.access, kind)) {
      return diagnostic(lineNumber, "Unsupported access widener modifier for target kind");
    }
    if (parts.length !== 5) {
      return diagnostic(
        lineNumber,
        `Expected ${kind} target: <access> ${kind} <owner> <name> <descriptor>`
      );
    }
    return {
      target: {
        kind,
        access: access.access,
        transitive: access.transitive,
        owner: parts[2],
        name: parts[3],
        descriptor: parts[4]
      }
    };
  }

  return diagnostic(lineNumber, "Unsupported access widener target kind");
}

function isAccessAllowedForKind(
  access: AccessWidenerAccess,
  kind: AccessWidenerTargetKind
): boolean {
  if (access === "accessible") {
    return true;
  }
  if (access === "extendable") {
    return kind === "class" || kind === "method";
  }
  return kind === "field";
}

function parseAccess(
  token: string | undefined
): { access: AccessWidenerAccess; transitive: boolean } | undefined {
  if (!token) {
    return undefined;
  }
  const transitive = token.startsWith("transitive-");
  const access = transitive ? token.slice("transitive-".length) : token;
  if (!ACCESS_MODIFIERS.has(access)) {
    return undefined;
  }
  return {
    access: access as AccessWidenerAccess,
    transitive
  };
}

function stripComment(line: string): string {
  return line.split("#", 1)[0] ?? "";
}

function diagnostic(
  line: number,
  message: string
): { diagnostic: AccessWidenerDiagnostic } {
  return {
    diagnostic: {
      line,
      message
    }
  };
}
