import { FemaFloodZoneClient } from "./fema-flood-zone-client";

describe("FemaFloodZoneClient", () => {
  let client: FemaFloodZoneClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new FemaFloodZoneClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a Special Flood Hazard Area hit (real shape returned by the live FEMA service, verified by hand)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ attributes: { FLD_ZONE: "AE", ZONE_SUBTY: null, SFHA_TF: "T" } }],
      }),
    });

    const result = await client.queryPoint(27.22, -80.78);

    expect(result).toEqual({ zone: "AE", zoneSubType: null, isSpecialFloodHazardArea: true });
  });

  it("parses a non-hazard zone as isSpecialFloodHazardArea: false, not null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ attributes: { FLD_ZONE: "X", ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD", SFHA_TF: "F" } }],
      }),
    });

    const result = await client.queryPoint(27.92, -81.8);

    expect(result).toEqual({
      zone: "X",
      zoneSubType: "AREA OF MINIMAL FLOOD HAZARD",
      isSpecialFloodHazardArea: false,
    });
  });

  it("returns null (not a thrown error) when the service returns no feature for the point", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });

    await expect(client.queryPoint(0, 0)).resolves.toBeNull();
  });

  it("returns null on a network failure rather than throwing, so one bad point doesn't abort a whole ingestion run", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.queryPoint(27.22, -80.78)).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.queryPoint(27.22, -80.78)).resolves.toBeNull();
  });
});
