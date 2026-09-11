import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../common/prisma/prisma.service";
import { AnthropicToolCallerService } from "../common/anthropic/anthropic-tool-caller.service";
import { PropertiesService } from "../properties/properties.service";
import { ReportGenerationService } from "./report-generation.service";

/**
 * Covers `runGeneration`'s status-machine orchestration (generating ->
 * delivered/failed) — the logic extracted out of `StripeWebhookService` so
 * it's shared, unduplicated, between the webhook's first-fulfillment path
 * and `AdminReportFulfillmentService`'s retry action (see this file's own
 * doc comment). `generateReportContent` itself (the actual Anthropic call)
 * is spied/mocked here rather than re-tested — that's `AiAnalysisService`-
 * pattern territory (a real SDK mock), not what this file is for.
 */
describe("ReportGenerationService.runGeneration", () => {
  let service: ReportGenerationService;

  const prismaMock = { reportOrder: { update: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportGenerationService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PropertiesService, useValue: {} },
        { provide: AnthropicToolCallerService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ReportGenerationService);
  });

  it("transitions generating -> delivered with the generated content persisted, on success", async () => {
    prismaMock.reportOrder.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "order-1", propertyId: "prop-1", reportTierCode: "essential", ...data }),
    );
    jest.spyOn(service, "generateReportContent").mockResolvedValue({
      conclusion: "Strong opportunity.",
      evidence: ["Opportunity Score: 90"],
      risks: [],
      confidence: "high",
      sources: ["Opportunity Score: 90"],
      nextAction: "Order a title search.",
    });

    await service.runGeneration("order-1");

    const calls = prismaMock.reportOrder.update.mock.calls;
    expect(calls[0][0]).toEqual({ where: { id: "order-1" }, data: { status: "generating" } });
    expect(calls[1][0]).toMatchObject({
      where: { id: "order-1" },
      data: { status: "delivered", content: { conclusion: "Strong opportunity." } },
    });
  });

  it("transitions generating -> failed, without throwing or issuing a refund, when generation fails", async () => {
    prismaMock.reportOrder.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "order-2", propertyId: "prop-2", reportTierCode: "essential", ...data }),
    );
    jest.spyOn(service, "generateReportContent").mockRejectedValue(new Error("model unavailable"));

    await expect(service.runGeneration("order-2")).resolves.toBeUndefined();

    const statuses = prismaMock.reportOrder.update.mock.calls.map((call) => call[0].data.status);
    expect(statuses).toEqual(["generating", "failed"]);
  });
});
