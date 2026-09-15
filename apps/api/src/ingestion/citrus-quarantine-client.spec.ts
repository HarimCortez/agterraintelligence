import { CitrusQuarantineClient } from "./citrus-quarantine-client";

describe("CitrusQuarantineClient", () => {
  let client: CitrusQuarantineClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new CitrusQuarantineClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a real active quarantine hit (DeSoto County, captured live while verifying this source)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ attributes: { Quarantine_Status: "Active Federal Quarantine" } }] }),
    });

    const result = await client.queryCountyStatus("DeSoto");

    expect(result).toEqual({ status: "Active Federal Quarantine" });
  });

  it("filters Quarantine_Status server-side to only active/modified statuses — never surfaces a real rescinded record as if it were still in effect", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });

    await client.queryCountyStatus("DeSoto");

    const requestedUrl = fetchMock.mock.calls[0]![0] as string;
    expect(requestedUrl).toContain("Quarantine_Status+IN+%28");
    expect(requestedUrl).toContain("Active+Federal+Quarantine");
    expect(requestedUrl).toContain("Modified+Federal+Quarantine");
    expect(requestedUrl).not.toContain("Rescinded");
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
