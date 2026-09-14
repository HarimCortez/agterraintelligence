import { ErsCountyEconomicClient, normalizeCountyName, parseCountyName, parseErsCsv } from "./ers-county-economic-client";

// Real lines captured from the live ERS bulk CSVs
// (ers.usda.gov/media/5499/population-estimates-... and
// ers.usda.gov/media/5497/unemployment-and-median-household-income-...)
// while verifying this data source, not fabricated — see
// ers-county-economic-client.ts's doc comment.
const POPULATION_HEADER = "FIPStxt,State,Area_Name,Attribute,Value";
const POLK_POP_ESTIMATE_LINE = "12105,FL,Polk County,POP_ESTIMATE_2023,818330";
const POLK_NET_MIG_LINE = "12105,FL,Polk County,NET_MIG_2023,29364";
const DESOTO_POP_LINE = "12027,FL,DeSoto County,POP_ESTIMATE_2023,35822";
const FLORIDA_STATE_TOTAL_LINE = "12000,FL,Florida,POP_ESTIMATE_2023,22610726";
const ALABAMA_COUNTY_LINE = "01001,AL,Autauga County,POP_ESTIMATE_2023,60342";

const UNEMPLOYMENT_HEADER = "FIPS_Code,State,Area_Name,Attribute,Value";
const POLK_UNEMPLOYMENT_LINE = '12105,FL,"Polk County, FL",Unemployment_rate_2023,3.7';
const POLK_INCOME_LINE = '12105,FL,"Polk County, FL",Median_Household_Income_2022,61941';
const DESOTO_UNEMPLOYMENT_LINE = '12027,FL,"DeSoto County, FL",Unemployment_rate_2023,4.9';

describe("normalizeCountyName", () => {
  it("uppercases and strips whitespace", () => {
    expect(normalizeCountyName("De Soto")).toBe("DESOTO");
  });
});

describe("parseCountyName", () => {
  it("strips the unquoted ' County' suffix used by the population file", () => {
    expect(parseCountyName("Polk County")).toBe(normalizeCountyName("Polk"));
  });

  it("strips the ' County, FL' suffix used by the unemployment/income file", () => {
    expect(parseCountyName("Polk County, FL")).toBe(normalizeCountyName("Polk"));
  });

  it("normalizes DeSoto County consistently regardless of file format", () => {
    expect(parseCountyName("DeSoto County")).toBe(parseCountyName("DeSoto County, FL"));
  });

  it("returns null for a state-level total row (no 'County' suffix)", () => {
    expect(parseCountyName("Florida")).toBeNull();
  });
});

describe("parseErsCsv", () => {
  it("parses real unquoted population rows, skipping the header", () => {
    const rows = parseErsCsv([POPULATION_HEADER, POLK_POP_ESTIMATE_LINE, POLK_NET_MIG_LINE].join("\n"));
    expect(rows).toEqual([
      { fips: "12105", state: "FL", areaName: "Polk County", attribute: "POP_ESTIMATE_2023", value: "818330" },
      { fips: "12105", state: "FL", areaName: "Polk County", attribute: "NET_MIG_2023", value: "29364" },
    ]);
  });

  it("parses real quoted rows with an embedded comma in Area_Name without misaligning fields", () => {
    const rows = parseErsCsv([UNEMPLOYMENT_HEADER, POLK_UNEMPLOYMENT_LINE].join("\n"));
    expect(rows).toEqual([
      { fips: "12105", state: "FL", areaName: "Polk County, FL", attribute: "Unemployment_rate_2023", value: "3.7" },
    ]);
  });

  it("skips blank lines", () => {
    const rows = parseErsCsv([POPULATION_HEADER, "", POLK_POP_ESTIMATE_LINE, ""].join("\n"));
    expect(rows).toHaveLength(1);
  });
});

describe("ErsCountyEconomicClient", () => {
  let client: ErsCountyEconomicClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new ErsCountyEconomicClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  function mockResponses(populationCsv: string, unemploymentIncomeCsv: string) {
    fetchMock.mockImplementation((url: string) => {
      const isPopulation = url.includes("5499");
      return Promise.resolve({
        ok: true,
        text: async () => (isPopulation ? populationCsv : unemploymentIncomeCsv),
      });
    });
  }

  it("merges population and unemployment/income figures for the same real county", async () => {
    mockResponses(
      [POPULATION_HEADER, POLK_POP_ESTIMATE_LINE, POLK_NET_MIG_LINE, FLORIDA_STATE_TOTAL_LINE, ALABAMA_COUNTY_LINE].join(
        "\n",
      ),
      [UNEMPLOYMENT_HEADER, POLK_UNEMPLOYMENT_LINE, POLK_INCOME_LINE].join("\n"),
    );

    const results = await client.fetchFloridaCountyResults();

    expect(results.get(normalizeCountyName("Polk"))).toEqual({
      populationYear: 2023,
      countyPopulation: 818330,
      countyNetMigration: 29364,
      unemploymentYear: 2023,
      countyUnemploymentRatePct: 3.7,
      incomeYear: 2022,
      countyMedianHouseholdIncomeCents: 6194100,
    });
  });

  it("excludes the state-level total row and non-Florida counties", async () => {
    mockResponses(
      [POPULATION_HEADER, FLORIDA_STATE_TOTAL_LINE, ALABAMA_COUNTY_LINE].join("\n"),
      [UNEMPLOYMENT_HEADER].join("\n"),
    );

    const results = await client.fetchFloridaCountyResults();

    expect(results.size).toBe(0);
  });

  it("still returns a partial record when only one file has data for a county", async () => {
    mockResponses([POPULATION_HEADER, DESOTO_POP_LINE].join("\n"), [UNEMPLOYMENT_HEADER].join("\n"));

    const results = await client.fetchFloridaCountyResults();

    expect(results.get(normalizeCountyName("DeSoto"))).toEqual({
      populationYear: 2023,
      countyPopulation: 35822,
      countyNetMigration: null,
      unemploymentYear: 2023,
      countyUnemploymentRatePct: null,
      incomeYear: 2022,
      countyMedianHouseholdIncomeCents: null,
    });
  });

  it("normalizes DeSoto County consistently across both real file formats", async () => {
    mockResponses([POPULATION_HEADER, DESOTO_POP_LINE].join("\n"), [UNEMPLOYMENT_HEADER, DESOTO_UNEMPLOYMENT_LINE].join("\n"));

    const results = await client.fetchFloridaCountyResults();

    expect(results.get(normalizeCountyName("DeSoto"))).toEqual({
      populationYear: 2023,
      countyPopulation: 35822,
      countyNetMigration: null,
      unemploymentYear: 2023,
      countyUnemploymentRatePct: 4.9,
      incomeYear: 2022,
      countyMedianHouseholdIncomeCents: null,
    });
  });

  it("returns an empty map (not a thrown error) when both requests fail", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.fetchFloridaCountyResults()).resolves.toEqual(new Map());
  });

  it("returns an empty map for a non-2xx response rather than throwing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.fetchFloridaCountyResults()).resolves.toEqual(new Map());
  });
});
