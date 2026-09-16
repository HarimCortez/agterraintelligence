import { ErsPovertyIncomeClient } from "./ers-poverty-income-client";

describe("ErsPovertyIncomeClient", () => {
  let client: ErsPovertyIncomeClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new ErsPovertyIncomeClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses real poverty/income figures for every county returned (real shape captured live)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              County: "Hardee",
              Poverty_Rate_ACS: 26.2255005269,
              Poverty_Rate_0_17_ACS: 40.6966086159,
              Deep_Pov_All: 9.4541622761,
              PerCapitaInc: 22377,
            },
          },
        ],
      }),
    });

    const results = await client.fetchFloridaCountyResults();

    expect(results.get("HARDEE")).toEqual({
      countyPovertyRatePct: 26.2255005269,
      countyChildPovertyRatePct: 40.6966086159,
      countyDeepPovertyRatePct: 9.4541622761,
      countyPerCapitaIncomeCents: 2237700,
    });
  });

  it("treats a null figure as null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              County: "Hardee",
              Poverty_Rate_ACS: 26.2,
              Poverty_Rate_0_17_ACS: null,
              Deep_Pov_All: 9.5,
              PerCapitaInc: null,
            },
          },
        ],
      }),
    });

    const results = await client.fetchFloridaCountyResults();

    expect(results.get("HARDEE")?.countyChildPovertyRatePct).toBeNull();
    expect(results.get("HARDEE")?.countyPerCapitaIncomeCents).toBeNull();
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
