import { AsianLonghornedTickClient } from "./asian-longhorned-tick-client";

describe("AsianLonghornedTickClient", () => {
  let client: AsianLonghornedTickClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new AsianLonghornedTickClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a real established-population hit (real shape captured live, e.g. a Virginia county)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ attributes: { Sheet1__Established_Status: "established" } }] }),
    });

    const result = await client.queryCountyStatus("Highlands");

    expect(result).toEqual({ status: "established" });
  });

  it("parses a real reported-only hit", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ attributes: { Sheet1__Established_Status: "reported" } }] }),
    });

    const result = await client.queryCountyStatus("Highlands");

    expect(result).toEqual({ status: "reported" });
  });

  it("returns null (real, confirmed outcome, not a broken query) for a Florida county — Florida has zero real tick detections on record", async () => {
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
