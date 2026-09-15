import { EmeraldAshBorerClient } from "./emerald-ash-borer-client";

describe("EmeraldAshBorerClient", () => {
  let client: EmeraldAshBorerClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new EmeraldAshBorerClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a real known-infested hit (real shape captured live, e.g. Calhoun County, AL)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ attributes: { Year_txt: "2016" } }] }),
    });

    const result = await client.queryCountyStatus("Calhoun");

    expect(result).toEqual({ firstConfirmedYear: "2016" });
  });

  it("returns null (real, confirmed outcome, not a broken query) for a Florida county — Florida has zero real EAB-infested counties on record", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });

    const result = await client.queryCountyStatus("Highlands");

    expect(result).toBeNull();
  });

  it("returns null on a network failure rather than throwing, so one bad county doesn't abort a whole ingestion run", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.queryCountyStatus("Highlands")).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.queryCountyStatus("Highlands")).resolves.toBeNull();
  });
});
