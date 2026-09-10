import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

/**
 * Lazily-constructed Stripe client wrapper — same defensive pattern as
 * `AiAnalysisService`'s original `getClient()` / the new
 * `AnthropicToolCallerService.getClient()`: no Stripe account/API keys are
 * provisioned yet, so every caller must fail a single request with a clean
 * 503 rather than crashing module bootstrap or leaking SDK internals.
 *
 * `getWebhookSecret()` is separate from `getClient()` because webhook
 * signature verification and "make a real Stripe API call" are two
 * different configuration requirements in principle (a deployment could
 * have one secret provisioned before the other during rollout) — callers
 * that need both call both and get the more specific failure first.
 */
@Injectable()
export class StripeClientService {
  private readonly logger = new Logger(StripeClientService.name);

  constructor(private readonly config: ConfigService) {}

  getClient(): Stripe {
    const apiKey = this.config.get<string>("STRIPE_SECRET_KEY");
    if (!apiKey) {
      this.logger.warn("Stripe called with no STRIPE_SECRET_KEY configured.");
      throw new ServiceUnavailableException(
        "Payments are not currently configured. Please try again later.",
      );
    }
    return new Stripe(apiKey);
  }

  getWebhookSecret(): string {
    const secret = this.config.get<string>("STRIPE_WEBHOOK_SECRET");
    if (!secret) {
      this.logger.warn("Stripe webhook called with no STRIPE_WEBHOOK_SECRET configured.");
      throw new ServiceUnavailableException(
        "Webhook processing is not currently configured.",
      );
    }
    return secret;
  }
}
