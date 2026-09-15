import { SuddenOakDeathQuarantineClient } from "./sudden-oak-death-quarantine-client";

describe("SuddenOakDeathQuarantineClient", () => {
  let client: SuddenOakDeathQuarantineClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new SuddenOakDeathQuarantineClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a real active quarantine hit (real shape captured live, e.g. Marin County, CA)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ attributes: { Quarantine_Status: "Active Federal Quarantine" } }] }),
    });

    const result = await client.queryCountyStatus("Marin");

    expect(result).toEqual({ status: "Active Federal Quarantine" });
  });

  it("filters Quarantine_Status server-side to only active/modified statuses, applied defensively even though every real row today is Active", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });

    await client.queryCountyStatus("Marin");

    const requestedUrl = fetchMock.mock.calls[0]![0] as string;
    expect(requestedUrl).toContain("Quarantine_Status+IN+%28");
    expect(requestedUrl).toContain("Active+Federal+Quarantine");
    expect(requestedUrl).toContain("Modified+Federal+Quarantine");
  });

  it("returns null (real, confirmed outcome, not a broken query) for a Florida county — Florida has zero real Sudden Oak Death quarantine rows at any status", async () => {
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
