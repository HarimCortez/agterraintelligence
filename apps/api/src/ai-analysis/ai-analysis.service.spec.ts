import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { LandUseType, ListingStatus } from "@agterra/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { AnthropicToolCallerService } from "../common/anthropic/anthropic-tool-caller.service";
import { PropertiesService } from "../properties/properties.service";
import { RawPropertyDetailRow } from "../properties/properties.serializers";
import { AiAnalysisService } from "./ai-analysis.service";
import { SUBMIT_ANALYSIS_TOOL_NAME } from "./ai-analysis.tool";

// Mock the whole SDK module so `new Anthropic(...)` returns an object whose
// `messages.create` we fully control per test, without a real network call
// (there is no ANTHROPIC_API_KEY available in this environment anyway).
const createMock = jest.fn();
jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

function makeRow(overrides: Partial<RawPropertyDetailRow> = {}): RawPropertyDetailRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    address: "123 Grove Rd",
    county: "Polk",
    state: "FL",
    acreage: "40",
    askingPriceCents: 100_000_00,
    landUseType: LandUseType.pasture,
    listingStatus: ListingStatus.active,
    lat: 27.9,
    lng: -81.7,
    opportunityScoreId: "score-1",
    opportunityScore: 82,
    opportunityBand: "strong",
    valuationId: "val-1",
    estimatedValueCents: 120_000_00,
    discountPct: "16.7",
    valuationConfidence: "modeled",
    riskFlags: [],
    ...overrides,
  };
}

function toolUseMessage(input: Record<string, unknown>) {
  return {
    id: "msg_1",
    content: [{ type: "tool_use", id: "tu_1", name: SUBMIT_ANALYSIS_TOOL_NAME, input }],
    stop_reason: "tool_use",
  };
}

const VALID_ANALYSIS = {
  conclusion: "Strong opportunity given the discount to estimated value.",
  evidence: ["Opportunity Score: 82 (strong)", "Valuation discount: 16.7%"],
  risks: ["No risk flags on file — absence of data is not the same as absence of risk."],
  confidence: "moderate",
  sources: ["Opportunity Score: 82 (strong)", "Valuation: confidence=moderate"],
  nextAction: "Order a title search and consult a licensed appraiser before making an offer.",
};

describe("AiAnalysisService", () => {
  let service: AiAnalysisService;
  const propertiesServiceMock = { getPropertyById: jest.fn() };
  const prismaMock = { aiInteraction: { create: jest.fn() } };

  function makeConfig(overrides: Record<string, string> = {}) {
    return new ConfigService({ AI_MODEL: "claude-sonnet-5", ANTHROPIC_API_KEY: "test-key", ...overrides });
  }

  async function build(config: ConfigService) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiAnalysisService,
        { provide: PropertiesService, useValue: propertiesServiceMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: config },
        // Real (unmocked) class — it uses the module-mocked `@anthropic-ai/sdk`
        // constructor internally, same as before extraction, so these tests'
        // expectations (createMock call args, error mapping) are unchanged.
        AnthropicToolCallerService,
      ],
    }).compile();
    return moduleRef.get(AiAnalysisService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propagates NotFoundException from the properties service without calling the model", async () => {
    propertiesServiceMock.getPropertyById.mockRejectedValue(new NotFoundException("Property with id x not found"));
    service = await build(makeConfig());

    await expect(service.askAboutProperty("missing-id")).rejects.toBeInstanceOf(NotFoundException);
    expect(createMock).not.toHaveBeenCalled();
    expect(prismaMock.aiInteraction.create).not.toHaveBeenCalled();
  });

  it("returns a clean 503 when ANTHROPIC_API_KEY is unset, without calling the SDK or logging", async () => {
    propertiesServiceMock.getPropertyById.mockResolvedValue(makeRow());
    service = await build(makeConfig({ ANTHROPIC_API_KEY: "" }));

    await expect(service.askAboutProperty("11111111-1111-1111-1111-111111111111")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(createMock).not.toHaveBeenCalled();
    expect(prismaMock.aiInteraction.create).not.toHaveBeenCalled();
  });

  it("on a successful tool-use response: forces the submit_analysis tool, returns the six-part shape, and logs the interaction", async () => {
    propertiesServiceMock.getPropertyById.mockResolvedValue(makeRow());
    createMock.mockResolvedValue(toolUseMessage(VALID_ANALYSIS));
    prismaMock.aiInteraction.create.mockResolvedValue({});
    service = await build(makeConfig());

    const result = await service.askAboutProperty("11111111-1111-1111-1111-111111111111", "Is this a good deal?");

    expect(createMock).toHaveBeenCalledTimes(1);
    const callArgs = createMock.mock.calls[0][0];
    expect(callArgs.tool_choice).toEqual({ type: "tool", name: SUBMIT_ANALYSIS_TOOL_NAME });
    expect(callArgs.model).toBe("claude-sonnet-5");

    expect(result).toEqual({
      propertyId: "11111111-1111-1111-1111-111111111111",
      question: "Is this a good deal?",
      ...VALID_ANALYSIS,
    });

    expect(prismaMock.aiInteraction.create).toHaveBeenCalledWith({
      data: {
        propertyId: "11111111-1111-1111-1111-111111111111",
        contextType: "property",
        question: "Is this a good deal?",
        response: { ...VALID_ANALYSIS },
        modelVersion: "claude-sonnet-5",
      },
    });
  });

  it("defaults the logged/echoed question to the implicit investment-thesis question when none is supplied", async () => {
    propertiesServiceMock.getPropertyById.mockResolvedValue(makeRow());
    createMock.mockResolvedValue(toolUseMessage(VALID_ANALYSIS));
    prismaMock.aiInteraction.create.mockResolvedValue({});
    service = await build(makeConfig());

    const result = await service.askAboutProperty("11111111-1111-1111-1111-111111111111");

    expect(result.question).toMatch(/investment case and Opportunity Score/i);
    expect(prismaMock.aiInteraction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ question: null }) }),
    );
  });

  it("maps an Anthropic API call failure to a 503 and does not log an interaction", async () => {
    propertiesServiceMock.getPropertyById.mockResolvedValue(makeRow());
    createMock.mockRejectedValue(new Error("rate limited"));
    service = await build(makeConfig());

    await expect(service.askAboutProperty("11111111-1111-1111-1111-111111111111")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prismaMock.aiInteraction.create).not.toHaveBeenCalled();
  });

  it("maps a missing tool_use block to a 503 and does not log an interaction", async () => {
    propertiesServiceMock.getPropertyById.mockResolvedValue(makeRow());
    createMock.mockResolvedValue({ id: "msg_1", content: [{ type: "text", text: "I refuse to use tools." }], stop_reason: "end_turn" });
    service = await build(makeConfig());

    await expect(service.askAboutProperty("11111111-1111-1111-1111-111111111111")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prismaMock.aiInteraction.create).not.toHaveBeenCalled();
  });

  it("maps a malformed tool-use input (e.g. bad confidence enum) to a 503 and does not log an interaction", async () => {
    propertiesServiceMock.getPropertyById.mockResolvedValue(makeRow());
    createMock.mockResolvedValue(toolUseMessage({ ...VALID_ANALYSIS, confidence: "certain" }));
    service = await build(makeConfig());

    await expect(service.askAboutProperty("11111111-1111-1111-1111-111111111111")).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prismaMock.aiInteraction.create).not.toHaveBeenCalled();
  });

  it("falls back to the claude-sonnet-5 default model when AI_MODEL is unset", async () => {
    propertiesServiceMock.getPropertyById.mockResolvedValue(makeRow());
    createMock.mockResolvedValue(toolUseMessage(VALID_ANALYSIS));
    prismaMock.aiInteraction.create.mockResolvedValue({});
    service = await build(new ConfigService({ ANTHROPIC_API_KEY: "test-key" }));

    await service.askAboutProperty("11111111-1111-1111-1111-111111111111");

    expect(createMock.mock.calls[0][0].model).toBe("claude-sonnet-5");
  });
});
