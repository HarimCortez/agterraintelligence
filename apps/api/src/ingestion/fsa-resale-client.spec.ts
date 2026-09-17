import { FsaResaleClient } from "./fsa-resale-client";

describe("FsaResaleClient", () => {
  let client: FsaResaleClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new FsaResaleClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  describe("searchFarmAndRanch", () => {
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
            propertyType: "Farm & Ranch",
            state: "PA",
            county: "Crawford",
            city: "Springboro",
            zip: "16435",
            streetAddress: "7624 Beaver Street",
            listingType: "REO Property",
            priceCents: 12_000_000,
            totalAcres: 30,
            bedrooms: null,
            bathrooms: null,
            squareFeet: null,
            totalUnits: null,
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

  describe("searchSingleFamily", () => {
    it("returns [] for a real 'Single Family Housing Properties Found: 0' response — confirmed live via curl for this pass (nationwide, no state filter)", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => `<h4>Single Family Housing Properties Found: 0</h4>`,
      });

      const results = await client.searchSingleFamily();

      expect(results).toEqual([]);
    });

    it("submits the real, verified search request shape (searchFormName=SFH, propertyType=Single Family, listingType=All Types, endpoint /resales/public/searchSFH) — endpoint path and hidden field values read directly off the real GET'd search-form HTML, not assumed from the Farm & Ranch pattern", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => `<h4>Single Family Housing Properties Found: 0</h4>`,
      });

      await client.searchSingleFamily("FL");

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://www.resales.usda.gov/resales/public/searchSFH");
      expect(init.method).toBe("POST");
      const body = init.body as string;
      expect(body).toContain("searchFormName=SFH");
      expect(body).toContain("propertyType=Single+Family");
      expect(body).toContain("listingType=All+Types");
      expect(body).toContain("stateCode=FL");
    });

    it(
      "parses a results table matching the documented column layout (Photo, Listing Type, Street Address, City, State, County, Zip, Price/Bid, Beds/Baths, Sq. Ft.) — " +
        "NOTE: this shape is from USDA's own user guide screenshots (p.15), not confirmed live populated HTML (see FsaResaleClient's doc comment)",
      async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          text: async () => `
            <h4>Single Family Housing Properties Found: 1</h4>
            <table>
              <tr><th>Photo</th><th>Listing Type</th><th>Street Address</th><th>City</th><th>State</th><th>County</th><th>Zip</th><th>Price/Bid</th><th>Beds / Baths</th><th>Sq. Ft.</th></tr>
              <tr>
                <td><img src="x.jpg"></td>
                <td>Foreclosure</td>
                <td>341 Harold Blvd</td>
                <td>Liberal</td>
                <td>KS</td>
                <td>Seward</td>
                <td>67901</td>
                <td>$71,400</td>
                <td>3/2</td>
                <td>1149</td>
              </tr>
            </table>
          `,
        });

        const results = await client.searchSingleFamily();

        expect(results).toEqual([
          {
            propertyType: "Single Family",
            state: "KS",
            county: "Seward",
            city: "Liberal",
            zip: "67901",
            streetAddress: "341 Harold Blvd",
            listingType: "Foreclosure",
            priceCents: 7_140_000,
            totalAcres: null,
            bedrooms: 3,
            bathrooms: 2,
            squareFeet: 1149,
            totalUnits: null,
          },
        ]);
      },
    );

    it("returns [] on a network failure rather than throwing", async () => {
      fetchMock.mockRejectedValue(new Error("network unreachable"));

      await expect(client.searchSingleFamily()).resolves.toEqual([]);
    });
  });

  describe("searchMultiFamily", () => {
    it("returns [] for a real 'Multi-Family Housing Properties Found: 0' response — confirmed live via curl for this pass (nationwide, no state filter)", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => `<h4>Multi-Family Housing Properties Found: 0</h4>`,
      });

      const results = await client.searchMultiFamily();

      expect(results).toEqual([]);
    });

    it("submits the real, verified search request shape (searchFormName=MFH, propertyType=Multi-Family, listingType=All Types, endpoint /resales/public/searchMFH) — endpoint path and hidden field values read directly off the real GET'd search-form HTML, not assumed from the Farm & Ranch pattern", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () => `<h4>Multi-Family Housing Properties Found: 0</h4>`,
      });

      await client.searchMultiFamily("FL");

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://www.resales.usda.gov/resales/public/searchMFH");
      expect(init.method).toBe("POST");
      const body = init.body as string;
      expect(body).toContain("searchFormName=MFH");
      expect(body).toContain("propertyType=Multi-Family");
      expect(body).toContain("listingType=All+Types");
      expect(body).toContain("stateCode=FL");
    });

    it(
      "parses a results table matching the documented column layout (Photo, Listing Type, Street Address, City, State, County, Zip, Price/Bid, Total Units) — " +
        "NOTE: this shape is from USDA's own user guide screenshots (p.18), not confirmed live populated HTML (see FsaResaleClient's doc comment)",
      async () => {
        fetchMock.mockResolvedValue({
          ok: true,
          text: async () => `
            <h4>Multi-Family Housing Properties Found: 1</h4>
            <table>
              <tr><th>Photo</th><th>Listing Type</th><th>Street Address</th><th>City</th><th>State</th><th>County</th><th>Zip</th><th>Price/Bid</th><th>Total Units</th></tr>
              <tr>
                <td><img src="x.jpg"></td>
                <td>REO Property</td>
                <td>12345 Marine Drive</td>
                <td>Camdenton</td>
                <td>MO</td>
                <td>Camden</td>
                <td>65432</td>
                <td>$1,250,000</td>
                <td>8</td>
              </tr>
            </table>
          `,
        });

        const results = await client.searchMultiFamily();

        expect(results).toEqual([
          {
            propertyType: "Multi-Family",
            state: "MO",
            county: "Camden",
            city: "Camdenton",
            zip: "65432",
            streetAddress: "12345 Marine Drive",
            listingType: "REO Property",
            priceCents: 125_000_000,
            totalAcres: null,
            bedrooms: null,
            bathrooms: null,
            squareFeet: null,
            totalUnits: 8,
          },
        ]);
      },
    );

    it("returns [] on a non-2xx response", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 });

      await expect(client.searchMultiFamily()).resolves.toEqual([]);
    });
  });
});
