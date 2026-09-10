type DurationUnit = "s" | "m" | "h" | "d";

const UNIT_MS: Record<DurationUnit, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function isDurationUnit(value: string): value is DurationUnit {
  return value === "s" || value === "m" || value === "h" || value === "d";
}

/**
 * Parses a short duration string ("15m", "12h", "30d", "45s") into
 * milliseconds. Deliberately minimal (single integer + unit) rather than
 * pulling in the `ms` package as a new dependency — this is only ever fed
 * our own env-var-configured TTL strings, not arbitrary user input.
 */
export function parseDurationMs(input: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration string "${input}" — expected e.g. "15m", "12h", "30d"`);
  }
  const [, amount, unit] = match;
  if (!amount || !unit || !isDurationUnit(unit)) {
    throw new Error(`Invalid duration string "${input}" — expected e.g. "15m", "12h", "30d"`);
  }
  return Number(amount) * UNIT_MS[unit];
}
