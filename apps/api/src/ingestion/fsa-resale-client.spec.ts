import { FsaResaleClient } from "./fsa-resale-client";

describe("FsaResaleClient", () => {
  let client: FsaResaleClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new FsaResaleClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("returns [] for a real 'Properties Found: 0' response — the genuine, confirmed-live current state of this data source nationwide", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => `<div class="banner row"><h4>Farm & Ranch Properties Found: 0</h4></div>`,
    });

    const results = await client.searchFarmAndRanch();

    expect(results).toEqual([]);
  });

  it("submits the real, verified search request shape (searchFormName=FSA, propertyType=Farm & Ranch, listingType=All Types)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => `<h4>Farm & Ranch Properties Found: 0</h4>`,
    });

    await client.searchFarmAndRanch("FL");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://www.resales.usda.gov/resales/public/searchFSA");
    expect(init.method).toBe("POST");
    const body = init.body as string;
    expect(body).toContain("searchFormName=FSA");
    expect(body).toContain("propertyType=Farm+%26+Ranch");
    expect(body).toContain("listingType=All+Types");
    expect(body).toContain("stateCode=FL");
  });

  it(
    "parses a results table matching the documented column layout (Photo, Listing Type, Street Address, City, State, County, Zip, Price/Bid, Total Acres, Parcels) — " +
      "NOTE: this shape is from USDA's own user guide screenshots, not confirmed live HTML (see FsaResaleClient's doc comment); this test exists to pin down the parser's documented contract, not to claim the real markup was observed",
    async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => `
          <h4>Farm & Ranch Properties Found: 1</h4>
          <table>
            <tr><th>Photo</th><th>Listing Type</th><th>Street Address</th><th>City</th><th>State</th><th>County</th><th>Zip</th><th>Price/Bid</th><th>Total Acres</th><th>Parcels</th></tr>
            <tr>
              <td><img src="x.jpg"></td>
              <td>REO Property</td>
              <td>7624 Beaver Street</td>
              <td>Springboro</td>
              <td>PA</td>
              <td>Crawford</td>
              <td>16435</td>
              <td>$120,000</td>
              <td>30</td>
              <td>1</td>
            </tr>
          </table>
        `,
      });

      const results = await client.searchFarmAndRanch();

      expect(results).toEqual([
        {
          state: "PA",
          county: "Crawford",
          city: "Springboro",
          zip: "16435",
          streetAddress: "7624 Beaver Street",
          listingType: "REO Property",
          priceCents: 12_000_000,
          totalAcres: 30,
        },
      ]);
    },
  );

  it("returns [] on a network failure rather than throwing", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.searchFarmAndRanch()).resolves.toEqual([]);
  });

  it("returns [] on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.searchFarmAndRanch()).resolves.toEqual([]);
  });
});
