import { UsdaSoilClient } from "./usda-soil-client";

describe("UsdaSoilClient", () => {
  let client: UsdaSoilClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new UsdaSoilClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a real SDA response, including the real 'Not prime farmland' classification (mu.farmlndcl)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        Table: [
          ["mukey", "musym", "muname", "farmlndcl", "drclassdcd", "flodfreqdcd", "slopegraddcp", "niccdcd", "hydclprs"],
          [
            "1425009",
            "17",
            "Smyrna and Myakka fine sands",
            "Not prime farmland",
            "Poorly drained",
            "None",
            "1.5",
            "4w",
            "5",
          ],
        ],
      }),
    });

    const result = await client.querySoilAtPoint(27.9, -81.7);

    expect(result).toEqual({
      mapUnitKey: "1425009",
      mapUnitSymbol: "17",
      mapUnitName: "Smyrna and Myakka fine sands",
      drainageClass: "Poorly drained",
      floodFrequency: "None",
      slopePercent: 1.5,
      capabilityClass: "4w",
      hydricPct: 5,
      farmlandClassification: "Not prime farmland",
    });
  });

  it("parses a real 'Prime farmland' classification without special-casing it", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        Table: [
          ["mukey", "musym", "muname", "farmlndcl", "drclassdcd", "flodfreqdcd", "slopegraddcp", "niccdcd", "hydclprs"],
          ["1425010", "8", "Some prime soil", "Prime farmland", "Well drained", "None", "0.5", "1", "0"],
        ],
      }),
    });

    const result = await client.querySoilAtPoint(41.5, -93.6);

    expect(result?.farmlandClassification).toBe("Prime farmland");
  });

  it("returns farmlandClassification: null when the column is blank (no farmland classification assigned)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        Table: [
          ["mukey", "musym", "muname", "farmlndcl", "drclassdcd", "flodfreqdcd", "slopegraddcp", "niccdcd", "hydclprs"],
          ["1425011", "99", "Water", "", "", "", "", "", ""],
        ],
      }),
    });

    const result = await client.querySoilAtPoint(27.26, -80.8);

    expect(result?.farmlandClassification).toBeNull();
  });

  it("returns null (not a thrown error) when SDA has no mapped soil at the point", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ Table: [["mukey", "musym", "muname", "farmlndcl", "drclassdcd", "flodfreqdcd", "slopegraddcp", "niccdcd", "hydclprs"]] }),
    });

    await expect(client.querySoilAtPoint(0, 0)).resolves.toBeNull();
  });

  it("returns null on a network failure rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.querySoilAtPoint(27.22, -80.78)).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.querySoilAtPoint(27.22, -80.78)).resolves.toBeNull();
  });
});
