import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { AnthropicToolCallerService } from "./anthropic-tool-caller.service";

const createMock = jest.fn();
jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

const TOOL = { name: "submit_thing", description: "d", input_schema: { type: "object", properties: {} } } as never;

describe("AnthropicToolCallerService", () => {
  let service: AnthropicToolCallerService;
  const prismaMock = { aiCallLog: { create: jest.fn() } };

  function makeConfig(overrides: Record<string, string> = {}) {
    return new ConfigService({ ANTHROPIC_API_KEY: "test-key", ...overrides });
  }

  async function build(config: ConfigService) {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnthropicToolCallerService,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    return moduleRef.get(AnthropicToolCallerService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseParams = {
    model: "claude-sonnet-5",
    maxTokens: 1024,
    systemPrompt: "sys",
    userPrompt: "user",
    tool: TOOL,
    toolName: "submit_thing",
    feature: "ai_analyst",
    logContext: "property p1",
  };

  it("logs a failed call (with no Anthropic call attempted) when the API key is missing", async () => {
    service = await build(makeConfig({ ANTHROPIC_API_KEY: "" }));

    await expect(service.callForcedTool(baseParams)).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(createMock).not.toHaveBeenCalled();
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ feature: "ai_analyst", detail: "property p1", status: "failed" }),
      }),
    );
  });

  it("logs a failed call with the underlying error message when the Anthropic API call itself fails", async () => {
    createMock.mockRejectedValue(new Error("rate limited"));
    service = await build(makeConfig());

    await expect(service.callForcedTool(baseParams)).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed", errorMessage: "rate limited", model: "claude-sonnet-5" }),
      }),
    );
  });

  it("logs a failed call when no matching tool_use block is returned", async () => {
    createMock.mockResolvedValue({ content: [], stop_reason: "end_turn", usage: { output_tokens: 12 } });
    service = await build(makeConfig());

    await expect(service.callForcedTool(baseParams)).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed", outputTokens: 12 }),
      }),
    );
  });

  it("logs a succeeded call with output tokens and a positive duration on the real success path", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", name: "submit_thing", input: { a: 1 } }],
      stop_reason: "tool_use",
      usage: { output_tokens: 42 },
    });
    service = await build(makeConfig());

    const result = await service.callForcedTool(baseParams);

    expect(result.input).toEqual({ a: 1 });
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          feature: "ai_analyst",
          detail: "property p1",
          model: "claude-sonnet-5",
          status: "succeeded",
          outputTokens: 42,
          errorMessage: null,
        }),
      }),
    );
    const loggedDurationMs = prismaMock.aiCallLog.create.mock.calls[0][0].data.durationMs;
    expect(typeof loggedDurationMs).toBe("number");
    expect(loggedDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("never throws when writing the log entry itself fails — the caller still gets its real result", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", name: "submit_thing", input: { a: 1 } }],
      stop_reason: "tool_use",
      usage: { output_tokens: 5 },
    });
    prismaMock.aiCallLog.create.mockRejectedValue(new Error("db unavailable"));
    service = await build(makeConfig());

    await expect(service.callForcedTool(baseParams)).resolves.toEqual(
      expect.objectContaining({ input: { a: 1 } }),
    );
  });
});
