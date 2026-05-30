const parseTimestampMs = (value: string): number | null => {
  const timestampMs = Date.parse(value);
  return Number.isNaN(timestampMs) ? null : timestampMs;
};

export const computeMinutesUntilReference = (
  value: string,
  referenceAt: string,
): number | null => {
  const valueMs = parseTimestampMs(value);
  const referenceMs = parseTimestampMs(referenceAt);

  if (valueMs === null || referenceMs === null) {
    return null;
  }

  return Math.round((valueMs - referenceMs) / 60_000);
};

export const isTimestampExpiredAt = (
  value: string,
  referenceAt: string,
): boolean | null => {
  const valueMs = parseTimestampMs(value);
  const referenceMs = parseTimestampMs(referenceAt);

  if (valueMs === null || referenceMs === null) {
    return null;
  }

  return valueMs <= referenceMs;
};
