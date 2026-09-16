import { ErsCountyTypologyClient } from "./ers-county-typology-client";

describe("ErsCountyTypologyClient", () => {
  let client: ErsCountyTypologyClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new ErsCountyTypologyClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses real classification flags for every county returned (real shape captured live)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              County: "Highlands",
              Type_2015_Farming_NO: 0,
              HiAmenity: 1,
              Retirement_Destination_2015_Update: 1,
              Population_loss_2015_update: 0,
              Low_Education_2015_update: 0,
              Low_Employment_2015_update: 1,
            },
          },
          {
            attributes: {
              County: "DeSoto",
              Type_2015_Farming_NO: 0,
              HiAmenity: 1,
              Retirement_Destination_2015_Update: 0,
              Population_loss_2015_update: 0,
              Low_Education_2015_update: 1,
              Low_Employment_2015_update: 1,
            },
          },
        ],
      }),
    });

    const results = await client.fetchFloridaCountyResults();

    expect(results.get("HIGHLANDS")).toEqual({
      countyFarmingDependent: false,
      countyHighNaturalAmenities: true,
      countyRetirementDestination: true,
      countyPopulationLoss: false,
      countyLowEducation: false,
      countyLowEmployment: true,
    });
    expect(results.get("DESOTO")).toEqual({
      countyFarmingDependent: false,
      countyHighNaturalAmenities: true,
      countyRetirementDestination: false,
      countyPopulationLoss: false,
      countyLowEducation: true,
      countyLowEmployment: true,
    });
  });

  it("treats a null flag as null, not false", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              County: "Highlands",
              Type_2015_Farming_NO: null,
              HiAmenity: 1,
              Retirement_Destination_2015_Update: 1,
              Population_loss_2015_update: 0,
              Low_Education_2015_update: 0,
              Low_Employment_2015_update: 1,
            },
          },
        ],
      }),
    });

    const results = await client.fetchFloridaCountyResults();

    expect(results.get("HIGHLANDS")?.countyFarmingDependent).toBeNull();
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
