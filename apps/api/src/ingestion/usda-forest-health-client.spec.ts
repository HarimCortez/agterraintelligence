import { UsdaForestHealthClient } from "./usda-forest-health-client";

describe("UsdaForestHealthClient", () => {
  let client: UsdaForestHealthClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new UsdaForestHealthClient();
    global.fetch = fetchMock;
    jest.clearAllMocks();
  });

  it("parses a real detection (cypress looper, Buckhead Ridge/Okeechobee, captured live while verifying this source)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              dca_common_name: "cypress looper",
              damage_type: "Defoliation > 75% of leaves defoliated",
              host: "known but not listed",
              survey_year: 2024,
              tree_count: null,
            },
          },
        ],
      }),
    });

    const result = await client.queryNearby(27.285, -80.92);

    expect(result).toEqual([
      {
        causalAgent: "cypress looper",
        damageType: "Defoliation > 75% of leaves defoliated",
        host: "known but not listed",
        surveyYear: 2024,
      },
    ]);
  });

  it("returns an empty array (real result, not an error) when no detections exist nearby — confirmed live for both this project's seeded timber properties", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    const result = await client.queryNearby(27.43, -81.38);

    expect(result).toEqual([]);
  });

  it("skips a malformed feature missing required fields rather than throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ attributes: { dca_common_name: "some pest" } }] }),
    });

    const result = await client.queryNearby(27.6, -81.86);

    expect(result).toEqual([]);
  });

  it("falls back to 'unknown' host when the real data has a null host", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ attributes: { dca_common_name: "bark beetle", damage_type: "Mortality", host: null, survey_year: 2023 } }],
      }),
    });

    const result = await client.queryNearby(27.6, -81.86);

    expect(result[0]?.host).toBe("unknown");
  });

  it("returns an empty array (not a thrown error) on a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network unreachable"));

    await expect(client.queryNearby(27.43, -81.38)).resolves.toEqual([]);
  });

  it("returns an empty array on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(client.queryNearby(27.43, -81.38)).resolves.toEqual([]);
  });
});
