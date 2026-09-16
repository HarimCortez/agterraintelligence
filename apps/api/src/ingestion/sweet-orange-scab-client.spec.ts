import { SweetOrangeScabClient } from "./sweet-orange-scab-client";

describe("SweetOrangeScabClient", () => {
  let client: SweetOrangeScabClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new SweetOrangeScabClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a real active-quarantine hit (real shape captured live — all 5 seed counties are under active quarantine)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ attributes: { Status: 2 } }] }),
    });

    const result = await client.queryCountyStatus("DeSoto");

    expect(result).toEqual({ status: "Active Federal Quarantine" });
  });

  it("returns null for a county with no active quarantine record", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });

    const result = await client.queryCountyStatus("Nonexistent");

    expect(result).toBeNull();
  });

  it("returns null on a network failure rather than throwing, so one bad county doesn't abort a whole ingestion run", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.queryCountyStatus("DeSoto")).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.queryCountyStatus("DeSoto")).resolves.toBeNull();
  });
});
