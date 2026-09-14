import AdmZip from "adm-zip";
import { normalizeCountyName, parseCauseOfLossLine, RmaCauseOfLossClient } from "./rma-cause-of-loss-client";

// Real lines captured from the live 2024 RMA Cause of Loss bulk file
// (pubfs-rma.fpac.usda.gov/.../colsom_2024.zip) while verifying this data
// source, not fabricated — see rma-cause-of-loss-client.ts's doc comment.
const HIGHLANDS_FREEZE_LINE =
  "2024|12|FL|055|Highlands                     |0021|Citrus                        |90|APH       |A|H |42|Freeze|01|JAN|2025|32|32|.0000000000|.0000000000|31234567.0000000000|4123456.0000000000|1234567.0000000000|2888889.0000000000|.0000000000|.0000000000|.0000000000|.0000000000|8689200.0000000000|2.11";

const POLK_ARPI_BUCKET_LINE =
  "2024|12|FL|105|Polk                          |0012|Blueberries                   |37|HIP-WI    |A|FL|55|ARPI/SCO/ECO/STAX/MP/PACE Crops Only|10|OCT|2024|9|9|.0000000000|694.5300000000|957458.0000000000|279760.0000000000|97915.0000000000|181845.0000000000|.0000000000|.0000000000|.0000000000|.0000000000|5000000.0000000000|3.42";

const DE_SOTO_WIND_LINE =
  "2024|12|FL|027|De Soto                       |0021|Citrus                        |90|APH       |A|H |61|Wind/Excess Wind|09|SEP|2024|20|20|.0000000000|.0000000000|12345678.0000000000|1234567.0000000000|456789.0000000000|777778.0000000000|.0000000000|.0000000000|.0000000000|.0000000000|4255454.0000000000|3.45";

const ALABAMA_COTTON_LINE =
  "2024|01|AL|001|Autauga                       |0021|Cotton                        |02|RP        |A|H |01|Decline in Price|10|OCT|2024|1|1|19.3500000000|.0000000000|8727.0000000000|644.0000000000|264.0000000000|380.0000000000|.0000000000|.0000000000|.0000000000|19.3500000000|272.0000000000|.42";

const ALL_OTHER_COUNTIES_LINE =
  "2024|12|FL|999|All Other Counties            |0021|Citrus                        |90|APH       |A|H |42|Freeze|01|JAN|2025|1|1|.0000000000|.0000000000|1000.0000000000|100.0000000000|50.0000000000|50.0000000000|.0000000000|.0000000000|.0000000000|.0000000000|500.0000000000|5.00";

describe("normalizeCountyName", () => {
  it("matches RMA's 'De Soto' spelling against this project's 'DeSoto'", () => {
    expect(normalizeCountyName("De Soto")).toBe(normalizeCountyName("DeSoto"));
  });
});

describe("parseCauseOfLossLine", () => {
  it("parses a real Highlands County Freeze line", () => {
    const result = parseCauseOfLossLine(HIGHLANDS_FREEZE_LINE);
    expect(result).toEqual({
      county: normalizeCountyName("Highlands"),
      causeCode: "42",
      cause: "Freeze",
      indemnityCents: 868920000,
    });
  });

  it("parses a real De Soto County line, normalizing RMA's 'De Soto' spelling", () => {
    const result = parseCauseOfLossLine(DE_SOTO_WIND_LINE);
    expect(result?.county).toBe(normalizeCountyName("DeSoto"));
  });

  it("still parses the real ARPI/SCO/ECO/STAX/MP/PACE bucket row — excluding it from the top-cause ranking happens in the aggregation step, not the per-line parser", () => {
    const result = parseCauseOfLossLine(POLK_ARPI_BUCKET_LINE);
    expect(result).toEqual({
      county: normalizeCountyName("Polk"),
      causeCode: "55",
      cause: "ARPI/SCO/ECO/STAX/MP/PACE Crops Only",
      indemnityCents: 500000000,
    });
  });

  it("ignores non-Florida rows", () => {
    expect(parseCauseOfLossLine(ALABAMA_COTTON_LINE)).toBeNull();
  });

  it("ignores RMA's 'All Other Counties' suppression bucket", () => {
    expect(parseCauseOfLossLine(ALL_OTHER_COUNTIES_LINE)).toBeNull();
  });

  it("returns null for a malformed line with too few fields", () => {
    expect(parseCauseOfLossLine("2024|12|FL|055|Highlands")).toBeNull();
  });
});

describe("RmaCauseOfLossClient", () => {
  let client: RmaCauseOfLossClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new RmaCauseOfLossClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  /** Builds a real in-memory zip (using the same real `adm-zip` library the client uses) containing one .txt entry with the given lines — a realistic fixture, not a hand-rolled fake. */
  function zipFixture(lines: string[]): ArrayBuffer {
    const zip = new AdmZip();
    zip.addFile("colsom_2024.txt", Buffer.from(lines.join("\n"), "latin1"));
    const buffer = zip.toBuffer();
    return new Uint8Array(buffer).buffer;
  }

  it("excludes the ARPI/SCO/ECO/STAX/MP/PACE bucket from the top-cause ranking but still counts it in the total", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => zipFixture([HIGHLANDS_FREEZE_LINE, POLK_ARPI_BUCKET_LINE]),
    });

    const results = await client.fetchFloridaCountyResults();

    expect(results.get(normalizeCountyName("Polk"))).toEqual({
      countyTopCauseOfLoss: null,
      countyTopCauseOfLossIndemnityCents: null,
      countyTotalIndemnityCents: 500000000,
    });
  });

  it("picks the real cause with the highest indemnity as the top cause", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => zipFixture([HIGHLANDS_FREEZE_LINE, DE_SOTO_WIND_LINE]),
    });

    const results = await client.fetchFloridaCountyResults();

    expect(results.get(normalizeCountyName("Highlands"))).toEqual({
      countyTopCauseOfLoss: "Freeze",
      countyTopCauseOfLossIndemnityCents: 868920000,
      countyTotalIndemnityCents: 868920000,
    });
  });

  it("returns an empty map (not a thrown error) when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.fetchFloridaCountyResults()).resolves.toEqual(new Map());
  });

  it("returns an empty map for a non-2xx response rather than throwing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.fetchFloridaCountyResults()).resolves.toEqual(new Map());
  });

  it("returns an empty map (not a thrown error) for a corrupt zip body", async () => {
    fetchMock.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });

    await expect(client.fetchFloridaCountyResults()).resolves.toEqual(new Map());
  });
});
