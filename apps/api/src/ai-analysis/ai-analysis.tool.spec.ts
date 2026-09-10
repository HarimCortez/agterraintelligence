import { InvalidAnalysisShapeError, parseAnalysisToolInput } from "./ai-analysis.tool";

function validInput(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    conclusion: "This property scores in the Strong band due to a meaningful discount to estimated value.",
    evidence: ["Opportunity Score: 82 (Strong)", "Valuation discount: 18%"],
    risks: ["Wetlands risk flag present (moderate severity)"],
    confidence: "moderate",
    sources: ["Opportunity Score: 82 (Strong)", "Valuation: estimatedValueCents=..., confidence=moderate"],
    nextAction: "Review the wetlands risk flag with a licensed environmental consultant before proceeding.",
    ...overrides,
  };
}

describe("parseAnalysisToolInput", () => {
  it("accepts a well-formed tool input and returns a narrowed AiAnalysisResult", () => {
    const result = parseAnalysisToolInput(validInput());
    expect(result).toEqual(validInput());
  });

  it.each(["high", "moderate", "limited", "unknown"])("accepts confidence=%s", (confidence) => {
    const result = parseAnalysisToolInput(validInput({ confidence }));
    expect(result.confidence).toBe(confidence);
  });

  it("rejects a non-object input", () => {
    expect(() => parseAnalysisToolInput("not an object")).toThrow(InvalidAnalysisShapeError);
    expect(() => parseAnalysisToolInput(null)).toThrow(InvalidAnalysisShapeError);
  });

  it("rejects a missing conclusion", () => {
    const input = validInput();
    delete input.conclusion;
    expect(() => parseAnalysisToolInput(input)).toThrow(/conclusion/);
  });

  it("rejects an empty-string conclusion", () => {
    expect(() => parseAnalysisToolInput(validInput({ conclusion: "   " }))).toThrow(/conclusion/);
  });

  it("rejects evidence that isn't a string array", () => {
    expect(() => parseAnalysisToolInput(validInput({ evidence: "not an array" }))).toThrow(/evidence/);
    expect(() => parseAnalysisToolInput(validInput({ evidence: [1, 2, 3] }))).toThrow(/evidence/);
  });

  it("rejects risks that isn't a string array", () => {
    expect(() => parseAnalysisToolInput(validInput({ risks: null }))).toThrow(/risks/);
  });

  it("rejects an invalid confidence value not in the allowed enum", () => {
    expect(() => parseAnalysisToolInput(validInput({ confidence: "certain" }))).toThrow(/confidence/);
  });

  it("rejects sources that isn't a string array", () => {
    expect(() => parseAnalysisToolInput(validInput({ sources: [{ url: "x" }] }))).toThrow(/sources/);
  });

  it("rejects a missing nextAction", () => {
    const input = validInput();
    delete input.nextAction;
    expect(() => parseAnalysisToolInput(input)).toThrow(/nextAction/);
  });
});
