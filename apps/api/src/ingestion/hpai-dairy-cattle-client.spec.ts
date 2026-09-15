import { HpaiDairyCattleClient } from "./hpai-dairy-cattle-client";

describe("HpaiDairyCattleClient", () => {
  let client: HpaiDairyCattleClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new HpaiDairyCattleClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("sums Total across every real monthly confirmation row for a state with confirmed events (real shape captured live, e.g. Michigan)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ attributes: { Total: 5 } }, { attributes: { Total: 3 } }],
      }),
    });

    const result = await client.queryStateStatus("MI");

    expect(result).toEqual({ totalConfirmedEvents: 8 });
  });

  it("returns null (real, confirmed outcome, not a broken query) for Florida — Florida has zero real rows on record", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ features: [] }) });

    const result = await client.queryStateStatus("FL");

    expect(result).toBeNull();
  });

  it("returns null on a network failure rather than throwing, so one bad state doesn't abort a whole ingestion run", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.queryStateStatus("FL")).resolves.toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.queryStateStatus("FL")).resolves.toBeNull();
  });
});
