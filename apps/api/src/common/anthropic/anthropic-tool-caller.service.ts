import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";

export interface ForcedToolCallParams {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
  tool: Anthropic.Tool;
  toolName: string;
  /**
   * Free-text identifier included in log lines to say what this call was
   * for (e.g. `property <id>` or `report order <id>`) — callers own the
   * wording since only they know what identifies their own unit of work.
   */
  logContext: string;
}

export interface ForcedToolCallResult {
  input: unknown;
  stopReason: Anthropic.Message["stop_reason"];
  outputTokens: number | undefined;
}

/**
 * Shared "call Claude with a forced tool-use and hand back the raw tool
 * input" mechanism.
 *
 * This exists so every feature that needs a structured, forced-tool-use
 * response from Claude (today: the free AI Analyst in `AiAnalysisService`,
 * and purchased-report generation in `ReportGenerationService`) goes
 * through one place for the actual Anthropic-calling mechanics, instead of
 * each constructing its own `Anthropic` client and re-implementing the same
 * lazy-client-construction / error-mapping. Originally this logic lived
 * directly in `AiAnalysisService`; it was extracted here unchanged in
 * substance when report generation needed the identical mechanism.
 *
 * Preserves the same three failure-mode mappings as the original
 * `AiAnalysisService`:
 *
 * 1. **`ANTHROPIC_API_KEY` missing.** Detected before any API call, thrown
 *    as `ServiceUnavailableException` (503) with a generic user-safe
 *    message — no SDK/auth internals leaked.
 * 2. **Anthropic API error** (network, rate limit, 5xx, timeout, invalid
 *    key rejected by Anthropic). Caught around the `messages.create` call,
 *    logged server-side via `Logger.error` with `logContext` and the
 *    underlying error, mapped to the same 503.
 * 3. **Model returns no matching `tool_use` block** (wrong tool, missing
 *    tool_use, refused via plain text). Logged via `Logger.error` and
 *    mapped to 503.
 *
 * Deliberately NOT this service's responsibility: validating the *shape*
 * of `tool_use.input` against a specific schema (that's caller-specific —
 * see `parseAnalysisToolInput`) and deciding what a caller does on failure
 * (an HTTP-facing caller like `AiAnalysisService` maps everything to a 503
 * response; a webhook-driven caller like `ReportGenerationService`'s
 * consumer instead marks a `ReportOrder` `failed` and logs — there is no
 * HTTP client waiting on that path).
 */
@Injectable()
export class AnthropicToolCallerService {
  private readonly logger = new Logger(AnthropicToolCallerService.name);

  constructor(private readonly config: ConfigService) {}

  async callForcedTool(params: ForcedToolCallParams): Promise<ForcedToolCallResult> {
    const client = this.getClient();

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
        tools: [params.tool],
        tool_choice: { type: "tool", name: params.toolName },
      });
    } catch (error) {
      this.logger.error(
        `Anthropic API call failed for ${params.logContext}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        "AI generation is temporarily unavailable. Please try again shortly.",
      );
    }

    const toolUseBlock = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === params.toolName,
    );

    if (!toolUseBlock) {
      this.logger.error(
        `Anthropic response for ${params.logContext} contained no ${params.toolName} tool_use block (stop_reason=${message.stop_reason})`,
      );
      throw new ServiceUnavailableException(
        "AI generation could not produce a valid result. Please try again shortly.",
      );
    }

    return {
      input: toolUseBlock.input,
      stopReason: message.stop_reason,
      outputTokens: message.usage?.output_tokens,
    };
  }

  /**
   * Lazily constructs the Anthropic client per call (not at DI/construction
   * time) so a missing `ANTHROPIC_API_KEY` fails a single request with a
   * clean 503 rather than crashing module bootstrap or the whole process —
   * matters concretely right now since no key is provisioned yet.
   */
  private getClient(): Anthropic {
    const apiKey = this.config.get<string>("ANTHROPIC_API_KEY");
    if (!apiKey) {
      this.logger.warn("Anthropic called with no ANTHROPIC_API_KEY configured.");
      throw new ServiceUnavailableException(
        "AI generation is not currently configured. Please try again later.",
      );
    }
    return new Anthropic({ apiKey });
  }
}
