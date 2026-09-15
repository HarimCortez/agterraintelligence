import { UsdaRdEligibilityClient } from "./usda-rd-eligibility-client";

describe("UsdaRdEligibilityClient", () => {
  let client: UsdaRdEligibilityClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new UsdaRdEligibilityClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("maps a real housing-ineligibility hit (Bartow, Polk County) to the 'housing' category", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            layerId: 4,
            layerName: "RHS SFH MFH",
            attributes: { OBJECTID: "6487", EFFECTIVE_DATE: "7/25/2023 10:33:06 AM" },
          },
        ],
      }),
    });

    const result = await client.queryPoint(27.92, -81.8);

    expect(result).toEqual(new Set(["housing"]));
  });

  it("maps both real business-layer hits (RBS and RBS 50K, Frostproof, Polk County) to a single 'business' category, not two", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { layerId: 2, layerName: "RBS" },
          { layerId: 3, layerName: "RBS 50K" },
        ],
      }),
    });

    const result = await client.queryPoint(27.95, -81.77);

    expect(result).toEqual(new Set(["business"]));
  });

  it("returns an empty set for a fully eligible point (real shape: no results at all)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    const result = await client.queryPoint(27.24, -80.83);

    expect(result).toEqual(new Set());
  });

  it("ignores an untracked layer id (e.g. broadband infrastructure) rather than throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ layerId: 8, layerName: "BB INFRA" }] }),
    });

    const result = await client.queryPoint(27.92, -81.8);

    expect(result).toEqual(new Set());
  });

  it("returns an empty set (not a thrown error) on a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.queryPoint(27.22, -80.78)).resolves.toEqual(new Set());
  });

  it("returns an empty set on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.queryPoint(27.22, -80.78)).resolves.toEqual(new Set());
  });
});
