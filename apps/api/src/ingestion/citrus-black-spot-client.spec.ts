import { CitrusBlackSpotClient } from "./citrus-black-spot-client";

describe("CitrusBlackSpotClient", () => {
  let client: CitrusBlackSpotClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new CitrusBlackSpotClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a real hit (a point inside a quarantine polygon, verified by hand against the live service)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ attributes: { Quarantine_Status: "Active Federal Quarantine" } }],
      }),
    });

    const result = await client.queryPoint(27.65, -81.52);

    expect(result).toEqual({ status: "Active Federal Quarantine" });
  });

  it("returns null (not a thrown error) when the point falls outside every quarantine polygon", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });

    await expect(client.queryPoint(27.19, -81.9)).resolves.toBeNull();
  });

  it("returns null on a network failure rather than throwing, so one bad point doesn't abort a whole ingestion run", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.queryPoint(27.19, -81.9)).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.queryPoint(27.19, -81.9)).resolves.toBeNull();
  });

  it("queries by point geometry, not by county, since the quarantine is sub-county polygon data", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });

    await client.queryPoint(27.65, -81.52);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("geometry=-81.52%2C27.65");
    expect(calledUrl).toContain("geometryType=esriGeometryPoint");
    expect(calledUrl).toContain("spatialRel=esriSpatialRelIntersects");
    expect(calledUrl).toContain("Quarantine_Program%3D%27Citrus+Black+Spot%27");
  });
});
