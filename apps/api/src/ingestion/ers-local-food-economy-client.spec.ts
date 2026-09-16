import { ErsLocalFoodEconomyClient } from "./ers-local-food-economy-client";

describe("ErsLocalFoodEconomyClient", () => {
  let client: ErsLocalFoodEconomyClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new ErsLocalFoodEconomyClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses real local food economy figures for every county returned (real shape captured live), stripping the County suffix and converting to percent/cents", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              name: "Polk County",
              orchard_acres17: 75302,
              berry_acres17: 1677,
              pct_loclsale17: 0.33454028,
              agritrsm_ops17: 15,
              agritrsm_rct17: 128000,
            },
          },
        ],
      }),
    });

    const results = await client.fetchFloridaCountyResults();

    expect(results.get("POLK")).toEqual({
      countyOrchardAcres: 75302,
      countyBerryAcres: 1677,
      countyDirectFarmSalesPct: 33.454028,
      countyAgritourismOperations: 15,
      countyAgritourismReceiptsCents: 12800000,
    });
  });

  it("treats a real disclosure-suppressed null figure as null (the real, confirmed outcome for 2 of 5 seed counties)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              name: "DeSoto County",
              orchard_acres17: 50970,
              berry_acres17: 70,
              pct_loclsale17: 0.45219293,
              agritrsm_ops17: 4,
              agritrsm_rct17: null,
            },
          },
        ],
      }),
    });

    const results = await client.fetchFloridaCountyResults();

    expect(results.get("DESOTO")?.countyAgritourismReceiptsCents).toBeNull();
  });

  it("returns an empty map on a network failure rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    const results = await client.fetchFloridaCountyResults();

    expect(results.size).toBe(0);
  });

  it("returns an empty map on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    const results = await client.fetchFloridaCountyResults();

    expect(results.size).toBe(0);
  });
});
