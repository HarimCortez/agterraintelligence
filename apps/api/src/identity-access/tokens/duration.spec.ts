import { parseDurationMs } from "./duration";

describe("parseDurationMs", () => {
  it.each([
    ["30s", 30_000],
    ["15m", 15 * 60_000],
    ["12h", 12 * 60 * 60_000],
    ["30d", 30 * 24 * 60 * 60_000],
  ])("parses %s to %i ms", (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it.each(["", "15", "m15", "15x", "-15m", "15.5m"])("rejects malformed input %p", (input) => {
    expect(() => parseDurationMs(input)).toThrow();
  });
});
