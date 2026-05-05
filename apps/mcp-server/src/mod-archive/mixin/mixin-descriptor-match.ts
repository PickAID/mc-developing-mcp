import type { MixinTargetMemberEvidence } from "./mixin-target-verifier.js";

const PRIMITIVE_DESCRIPTORS: Record<string, string> = {
  Z: "boolean",
  B: "byte",
  C: "char",
  S: "short",
  I: "int",
  J: "long",
  F: "float",
  D: "double"
};

interface ComparableJavaType {
  name: string;
  dimensions: number;
  primitive: boolean;
}

export interface DescriptorNarrowing {
  matches: MixinTargetMemberEvidence[];
  decisive: boolean;
  proofLevel: "parameter_types" | "not_proven";
}

export function narrowMixinMembersByDescriptor(
  matches: MixinTargetMemberEvidence[],
  descriptor: string | undefined
): DescriptorNarrowing | undefined {
  if (descriptor === undefined) {
    return undefined;
  }

  const requestedParameters = jvmDescriptorParameterTypes(descriptor);
  if (requestedParameters === undefined) {
    return { matches, decisive: false, proofLevel: "not_proven" };
  }

  const candidateParameters = matches.map((member) =>
    javaSignatureParameterTypes(member.signature)
  );
  if (candidateParameters.some((parameters) => parameters === undefined)) {
    return { matches, decisive: false, proofLevel: "not_proven" };
  }

  return {
    matches: matches.filter((_, index) =>
      sameParameterTypes(requestedParameters, candidateParameters[index] ?? [])
    ),
    decisive: true,
    proofLevel: "parameter_types"
  };
}

function jvmDescriptorParameterTypes(
  descriptor: string | undefined
): ComparableJavaType[] | undefined {
  if (!descriptor?.startsWith("(")) {
    return undefined;
  }

  let index = 1;
  const parameters: ComparableJavaType[] = [];
  while (index < descriptor.length) {
    const marker = descriptor[index];
    if (marker === ")") {
      return parameters;
    }

    let dimensions = 0;
    while (descriptor[index] === "[") {
      dimensions += 1;
      index += 1;
    }

    const type = descriptor[index];
    const primitive = PRIMITIVE_DESCRIPTORS[type];
    if (primitive !== undefined) {
      parameters.push({ name: primitive, dimensions, primitive: true });
      index += 1;
      continue;
    }
    if (type === "L") {
      const end = descriptor.indexOf(";", index);
      if (end === -1) {
        return undefined;
      }
      parameters.push({
        name: normalizeClassName(descriptor.slice(index + 1, end)),
        dimensions,
        primitive: false
      });
      index = end + 1;
      continue;
    }

    return undefined;
  }

  return undefined;
}

function javaSignatureParameterTypes(
  signature: string | undefined
): ComparableJavaType[] | undefined {
  const start = signature?.indexOf("(") ?? -1;
  const end = signature?.lastIndexOf(")") ?? -1;
  if (!signature || start === -1 || end < start) {
    return undefined;
  }

  const parameters = signature.slice(start + 1, end).trim();
  if (parameters.length === 0) {
    return [];
  }

  const parsed = splitJavaParameters(parameters).map(parseJavaParameterType);
  if (parsed.some((parameter) => parameter === undefined)) {
    return undefined;
  }

  return parsed as ComparableJavaType[];
}

function splitJavaParameters(parameters: string): string[] {
  let angleDepth = 0;
  let start = 0;
  const result: string[] = [];
  for (let index = 0; index < parameters.length; index += 1) {
    const character = parameters[index];
    if (character === "<") {
      angleDepth += 1;
    } else if (character === ">" && angleDepth > 0) {
      angleDepth -= 1;
    } else if (character === "," && angleDepth === 0) {
      result.push(parameters.slice(start, index).trim());
      start = index + 1;
    }
  }

  result.push(parameters.slice(start).trim());
  return result;
}

function parseJavaParameterType(
  parameter: string
): ComparableJavaType | undefined {
  let typeName = eraseGenericArguments(parameter)
    .replace(/\bfinal\b/g, "")
    .replace(/\bvolatile\b/g, "")
    .trim();
  if (typeName.length === 0 || typeName.includes("@")) {
    return undefined;
  }

  const parts = typeName.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    let variableName = parts.at(-1) ?? "";
    typeName = parts.slice(0, -1).join("");
    while (variableName.endsWith("[]")) {
      typeName += "[]";
      variableName = variableName.slice(0, -2);
    }
  }

  typeName = typeName.replaceAll("...", "[]").replaceAll(" ", "");
  let dimensions = 0;
  while (typeName.endsWith("[]")) {
    dimensions += 1;
    typeName = typeName.slice(0, -2);
  }

  if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(typeName)) {
    return undefined;
  }

  return {
    name: normalizeClassName(typeName),
    dimensions,
    primitive: Object.values(PRIMITIVE_DESCRIPTORS).includes(typeName)
  };
}

function eraseGenericArguments(value: string): string {
  let depth = 0;
  let result = "";
  for (const character of value) {
    if (character === "<") {
      depth += 1;
    } else if (character === ">" && depth > 0) {
      depth -= 1;
    } else if (depth === 0) {
      result += character;
    }
  }
  return result;
}

function sameParameterTypes(
  requested: ComparableJavaType[],
  candidate: ComparableJavaType[]
): boolean {
  return requested.length === candidate.length
    && requested.every((type, index) => sameType(type, candidate[index]));
}

function sameType(
  requested: ComparableJavaType,
  candidate: ComparableJavaType | undefined
): boolean {
  if (candidate === undefined || requested.dimensions !== candidate.dimensions) {
    return false;
  }
  if (requested.primitive || candidate.primitive) {
    return requested.primitive
      && candidate.primitive
      && requested.name === candidate.name;
  }

  return requested.name === candidate.name
    || simpleNameOf(requested.name) === candidate.name;
}

function normalizeClassName(className: string): string {
  return className.trim().replaceAll("/", ".");
}

function simpleNameOf(className: string): string {
  const index = className.lastIndexOf(".");
  return index === -1 ? className : className.slice(index + 1);
}
