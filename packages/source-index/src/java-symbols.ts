export interface JavaSourceSymbol {
  packageName?: string;
  simpleName: string;
  qualifiedName: string;
}

const PACKAGE_PATTERN = /^\s*package\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/m;
const TYPE_PATTERN =
  /^\s*(?:(?:public|protected|private|abstract|final|sealed|non-sealed|static)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)\b/gm;

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
