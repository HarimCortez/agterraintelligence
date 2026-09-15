import { FireAntQuarantineClient } from "./fire-ant-quarantine-client";

describe("FireAntQuarantineClient", () => {
  let client: FireAntQuarantineClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new FireAntQuarantineClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a real active quarantine hit (Polk County, captured live while verifying this source)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ attributes: { Quarantine_Status: "Active Federal Quarantine" } }] }),
    });

    const result = await client.queryCountyStatus("Polk");

    expect(result).toEqual({ status: "Active Federal Quarantine" });
  });

  it("returns null (not a thrown error) when the county has no matching quarantine record", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });

    const result = await client.queryCountyStatus("Miami-Dade");

    expect(result).toBeNull();
  });

  it("returns null on a network failure rather than throwing, so one bad county doesn't abort a whole ingestion run", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.queryCountyStatus("Polk")).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.queryCountyStatus("Polk")).resolves.toBeNull();
  });
});
