export interface DatapackPackFormatVersion {
  major: number;
  minor: number | null;
  id: string;
}

export interface DatapackSupportedFormats {
  minInclusive: number;
  maxInclusive: number;
  minFormat: DatapackPackFormatVersion;
  maxFormat: DatapackPackFormatVersion;
}

export function createPackFormatVersion(
  major: number,
  minor?: number,
  options: { explicitMinor?: boolean; wildcardMinor?: boolean } = {}
): DatapackPackFormatVersion {
  if (options.wildcardMinor) {
    return {
      major,
      minor: null,
      id: `${major}.*`
    };
  }

  const resolvedMinor = minor ?? 0;
  return {
    major,
    minor: resolvedMinor,
    id: options.explicitMinor || minor !== undefined
      ? `${major}.${resolvedMinor}`
      : `${major}`
  };
}

export function packFormatToNumber(
  format: DatapackPackFormatVersion | undefined
): number | undefined {
  if (!format || format.minor === null) {
    return undefined;
  }
  return Number(format.id);
}

export function parsePackFormatValue(
  value: unknown
): DatapackPackFormatVersion | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return parseNumericPackFormat(value);
  }
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return createPackFormatVersion(value[0], value[1], {
      explicitMinor: true
    });
  }
  return undefined;
}

export function parseSupportedFormats(
  value: unknown
): DatapackSupportedFormats | undefined {
  if (typeof value === "number") {
    const exact = createPackFormatVersion(value);
    return createRange(exact, exact);
  }
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return normalizeRange(
      createPackFormatVersion(value[0]),
      createPackFormatVersion(value[1], undefined, { wildcardMinor: true })
    );
  }
  if (isRecord(value)) {
    const min = value.min_inclusive;
    const max = value.max_inclusive;
    return typeof min === "number" && typeof max === "number"
      ? normalizeRange(
        createPackFormatVersion(min),
        createPackFormatVersion(max, undefined, { wildcardMinor: true })
      )
      : undefined;
  }
  return undefined;
}

export function parseMinMaxFormats(input: {
  minFormat?: unknown;
  maxFormat?: unknown;
}): DatapackSupportedFormats | undefined {
  const min = parseFormatBound(input.minFormat, "min");
  const max = parseFormatBound(input.maxFormat, "max");

  if (!min || !max) {
    return undefined;
  }
  return normalizeRange(min, max);
}

export function comparePackFormats(
  left: DatapackPackFormatVersion,
  right: DatapackPackFormatVersion
): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  return comparableMinor(left) - comparableMinor(right);
}

export function formatInRange(
  format: DatapackPackFormatVersion,
  range: DatapackSupportedFormats
): boolean {
  return (
    comparePackFormats(format, range.minFormat) >= 0 &&
    comparePackFormats(format, range.maxFormat) <= 0
  );
}

export function samePackFormat(
  left: DatapackPackFormatVersion,
  right: DatapackPackFormatVersion
): boolean {
  return comparePackFormats(left, right) === 0;
}

function parseNumericPackFormat(value: number): DatapackPackFormatVersion {
  if (Number.isInteger(value)) {
    return createPackFormatVersion(value);
  }

  const [major, minor] = value.toString().split(".").map(Number);
  return createPackFormatVersion(major, minor, { explicitMinor: true });
}

function parseFormatBound(
  value: unknown,
  bound: "min" | "max"
): DatapackPackFormatVersion | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return createPackFormatVersion(value, undefined, {
      wildcardMinor: bound === "max"
    });
  }
  return parsePackFormatValue(value);
}

function normalizeRange(
  left: DatapackPackFormatVersion,
  right: DatapackPackFormatVersion
): DatapackSupportedFormats {
  return comparePackFormats(left, right) <= 0
    ? createRange(left, right)
    : createRange(right, left);
}

function createRange(
  minFormat: DatapackPackFormatVersion,
  maxFormat: DatapackPackFormatVersion
): DatapackSupportedFormats {
  return {
    minInclusive: minFormat.major,
    maxInclusive: maxFormat.major,
    minFormat,
    maxFormat
  };
}

function comparableMinor(format: DatapackPackFormatVersion): number {
  return format.minor ?? Number.MAX_SAFE_INTEGER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
