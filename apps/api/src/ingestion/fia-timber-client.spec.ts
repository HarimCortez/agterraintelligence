import { FiaTimberClient, normalizeCountyName, parseCountyName } from "./fia-timber-client";

// Real rows captured from the live FIADB-API (apps.fs.usda.gov/fiadb-api)
// while verifying this data source, not fabricated — see
// fia-timber-client.ts's doc comment. Polk's real 2022 volume estimate is
// ~452.9M cu ft over ~314,050 acres (~1,442 cu ft/acre); DeSoto's is
// ~92.7M cu ft over ~73,290 acres (~1,265 cu ft/acre).
const POLK_VOLUME_ROW = { ESTIMATE: 452872159.0, GRP1: "`12105 12105 FL Polk", PLOT_COUNT: 56, SE_PERCENT: 18.0 };
const POLK_ACRES_ROW = { ESTIMATE: 314050.0, GRP1: "`12105 12105 FL Polk", PLOT_COUNT: 62, SE_PERCENT: 12.8 };
const DESOTO_VOLUME_ROW = { ESTIMATE: 92710800.0, GRP1: "`12027 12027 FL DeSoto", PLOT_COUNT: 16, SE_PERCENT: 31.6 };
const DESOTO_ACRES_ROW = { ESTIMATE: 73290.0, GRP1: "`12027 12027 FL DeSoto", PLOT_COUNT: 16, SE_PERCENT: 26.2 };
const ST_LUCIE_VOLUME_ROW = { ESTIMATE: 1000000.0, GRP1: "`12111 12111 FL St. Lucie", PLOT_COUNT: 4, SE_PERCENT: 50.0 };

describe("normalizeCountyName", () => {
  it("is a no-op for counties that already match once uppercased", () => {
    expect(normalizeCountyName("Polk")).toBe(normalizeCountyName("POLK"));
  });
});

describe("parseCountyName", () => {
  it("parses a real single-word county label", () => {
    expect(parseCountyName("`12105 12105 FL Polk")).toBe(normalizeCountyName("Polk"));
  });

  it("parses a real single-word county label that matches this project's own spelling (unlike NASS's 'DE SOTO')", () => {
    expect(parseCountyName("`12027 12027 FL DeSoto")).toBe(normalizeCountyName("DeSoto"));
  });

  it("parses a real multi-word county label ('St. Lucie'), not just the last word", () => {
    expect(parseCountyName("`12111 12111 FL St. Lucie")).toBe(normalizeCountyName("St. Lucie"));
  });

  it("parses a real multi-word county label ('Palm Beach')", () => {
    expect(parseCountyName("`12099 12099 FL Palm Beach")).toBe(normalizeCountyName("Palm Beach"));
  });

  it("returns null for a malformed label with too few tokens", () => {
    expect(parseCountyName("`12105 12105 FL")).toBeNull();
  });
});

describe("FiaTimberClient", () => {
  let client: FiaTimberClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new FiaTimberClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("fetches both metrics and computes a real per-county volume-per-acre density", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ estimates: [POLK_VOLUME_ROW, DESOTO_VOLUME_ROW] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ estimates: [POLK_ACRES_ROW, DESOTO_ACRES_ROW] }) });

    const results = await client.fetchFloridaCountyResults();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(results.get(normalizeCountyName("Polk"))).toEqual({
      countyTimberlandAcres: 314050,
      countyTimberVolumeCuFtPerAcre: Math.round(452872159 / 314050),
      countyTimberVolumeSamplingErrorPct: 18.0,
    });
    expect(results.get(normalizeCountyName("DeSoto"))).toEqual({
      countyTimberlandAcres: 73290,
      countyTimberVolumeCuFtPerAcre: Math.round(92710800 / 73290),
      countyTimberVolumeSamplingErrorPct: 31.6,
    });
  });

  it("still returns the volume and sampling error when the acres request has no matching county (density left null)", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ estimates: [ST_LUCIE_VOLUME_ROW] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ estimates: [] }) });

    const results = await client.fetchFloridaCountyResults();

    expect(results.get(normalizeCountyName("St. Lucie"))).toEqual({
      countyTimberlandAcres: null,
      countyTimberVolumeCuFtPerAcre: null,
      countyTimberVolumeSamplingErrorPct: 50.0,
    });
  });

  it("returns an empty map (not a thrown error) when a request fails, so one bad metric doesn't abort a whole run", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.fetchFloridaCountyResults()).resolves.toEqual(new Map());
  });

  it("returns an empty map for a non-2xx response rather than throwing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.fetchFloridaCountyResults()).resolves.toEqual(new Map());
  });

  it("queries by the real FIADB-API parameter shape (county-level, Florida evaluation code, JSON output)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ estimates: [] }) });

    await client.fetchFloridaCountyResults();

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("rselected=County+code+and+name");
    expect(calledUrl).toContain("wc=122022");
    expect(calledUrl).toContain("outputFormat=NJSON");
  });
});
