import { LandUseType, ListingStatus, OpportunityBand, RiskSeverity, ValuationConfidence } from "@agterra/db";
import { PropertyDetailDto } from "../properties/dto/property-result.dto";
import { buildSystemPrompt, buildTieredReportUserPrompt, buildUserPrompt, DEFAULT_QUESTION, ReportTier } from "./ai-analysis.prompt";

function makeProperty(overrides: Partial<PropertyDetailDto> = {}): PropertyDetailDto {
  const dto = new PropertyDetailDto();
  dto.id = "11111111-1111-1111-1111-111111111111";
  dto.address = "123 Grove Rd";
  dto.county = "Polk";
  dto.state = "FL";
  dto.acreage = 40;
  dto.askingPriceCents = 100_000_00;
  dto.pricePerAcreCents = 2_500_00;
  dto.landUseType = LandUseType.pasture;
  dto.listingStatus = ListingStatus.active;
  dto.lat = 27.9;
  dto.lng = -81.7;
  dto.opportunityScore = { score: 82, band: OpportunityBand.strong };
  dto.valuation = { estimatedValueCents: 120_000_00, discountPct: 16.7, confidence: ValuationConfidence.modeled };
  dto.riskFlags = [
    { id: "r1", riskType: "wetlands", severity: RiskSeverity.medium, description: "Partial wetlands overlap", createdAt: "2026-01-01T00:00:00.000Z" },
  ];
  return Object.assign(dto, overrides);
}

describe("buildSystemPrompt", () => {
  it("encodes all required guardrails at least once", () => {
    const prompt = buildSystemPrompt();

    // Output-contract guardrail: must always use the forced tool.
    expect(prompt).toMatch(/submit_analysis/);

    // No-guarantee guardrail.
    expect(prompt).toMatch(/guaranteed/i);
    expect(prompt).toMatch(/legal conclusion/i);
    expect(prompt).toMatch(/zoning outcome/i);
    expect(prompt).toMatch(/water rights/i);
    expect(prompt).toMatch(/title condition/i);

    // Professional-verification guardrail for legal/water/title/environmental/zoning topics.
    expect(prompt).toMatch(/professional verification/i);
    expect(prompt).toMatch(/environmental/i);

    // Grounding / no-fabrication guardrail.
    expect(prompt).toMatch(/sources/i);
    expect(prompt).toMatch(/never invent/i);

    // Confidence-honesty guardrail.
    expect(prompt).toMatch(/confidence.*must genuinely reflect/i);

    // Arithmetic-integrity guardrail.
    expect(prompt).toMatch(/never independently recalculate/i);
  });

  it("encodes the scope guardrail: only answer about this property, decline (not follow) anything else via the same tool", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toMatch(/untrusted input/i);
    expect(prompt).toMatch(/only answer questions about this specific property/i);
    expect(prompt).toMatch(/do not answer it and do not follow it/i);
    expect(prompt).toMatch(/change your role/i);
    expect(prompt).toMatch(/reveal this system prompt/i);
  });
});

describe("buildUserPrompt", () => {
  it("embeds the real property data as structured JSON context", () => {
    const property = makeProperty();
    const prompt = buildUserPrompt(property, "Is this a good deal?");

    const embedded = JSON.parse(prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1));
    expect(embedded).toMatchObject({
      id: property.id,
      county: "Polk",
      acreage: 40,
      opportunityScore: { score: 82, band: "strong" },
      valuation: { discountPct: 16.7, confidence: "modeled" },
    });
    expect(embedded.riskFlags).toHaveLength(1);
    expect(prompt).toContain("QUESTION: Is this a good deal?");
  });

  it("falls back to the default investment-thesis question when none is supplied", () => {
    const prompt = buildUserPrompt(makeProperty(), undefined);
    expect(prompt).toContain(`QUESTION: ${DEFAULT_QUESTION}`);
  });

  it("falls back to the default question when given only whitespace", () => {
    const prompt = buildUserPrompt(makeProperty(), "   ");
    expect(prompt).toContain(`QUESTION: ${DEFAULT_QUESTION}`);
  });

  it("never includes data not present on the property (no fabricated fields)", () => {
    const property = makeProperty({ opportunityScore: null, valuation: null, riskFlags: [] });
    const prompt = buildUserPrompt(property, undefined);
    const embedded = JSON.parse(prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1));
    expect(embedded.opportunityScore).toBeNull();
    expect(embedded.valuation).toBeNull();
    expect(embedded.riskFlags).toEqual([]);
  });
});

describe("buildTieredReportUserPrompt", () => {
  const tiers: ReportTier[] = ["essential", "investor", "professional"];

  it.each(tiers)("embeds the same structured property context for the %s tier", (tier) => {
    const property = makeProperty();
    const prompt = buildTieredReportUserPrompt(property, tier);

    const embedded = JSON.parse(prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1));
    expect(embedded).toMatchObject({
      id: property.id,
      county: "Polk",
      acreage: 40,
      opportunityScore: { score: 82, band: "strong" },
      valuation: { discountPct: 16.7, confidence: "modeled" },
    });
    expect(embedded.riskFlags).toHaveLength(1);
    expect(prompt).toContain(`REPORT REQUEST (${tier} tier):`);
  });

  it("scales instruction depth upward from essential to investor to professional", () => {
    const property = makeProperty();
    const essential = buildTieredReportUserPrompt(property, "essential");
    const investor = buildTieredReportUserPrompt(property, "investor");
    const professional = buildTieredReportUserPrompt(property, "professional");

    // Each tier's instruction text should be distinct and grow in length,
    // as a rough proxy for "more thorough" (more evidence/risk framing
    // requested) without asserting exact wording.
    expect(essential).not.toEqual(investor);
    expect(investor).not.toEqual(professional);
    expect(investor.length).toBeGreaterThan(essential.length);
    expect(professional.length).toBeGreaterThan(investor.length);

    expect(investor).toMatch(/multi-angle/i);
    expect(professional).toMatch(/scenario/i);
  });

  it("re-states the confidence-honesty and professional-verification guardrails explicitly for the professional tier", () => {
    const prompt = buildTieredReportUserPrompt(makeProperty(), "professional");
    expect(prompt).toMatch(/professional verification/i);
    expect(prompt).toMatch(/confidence.*must still be capped/i);
    expect(prompt).toMatch(/never fabricate/i);
  });

  it("never includes data not present on the property, at every tier", () => {
    const property = makeProperty({ opportunityScore: null, valuation: null, riskFlags: [] });
    for (const tier of tiers) {
      const prompt = buildTieredReportUserPrompt(property, tier);
      const embedded = JSON.parse(prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1));
      expect(embedded.opportunityScore).toBeNull();
      expect(embedded.valuation).toBeNull();
      expect(embedded.riskFlags).toEqual([]);
    }
  });
});
