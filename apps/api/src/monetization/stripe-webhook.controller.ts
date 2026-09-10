import { Controller, Headers, HttpCode, HttpStatus, Post, RawBodyRequest, Req } from "@nestjs/common";
import { Request } from "express";
import { StripeWebhookService } from "./stripe-webhook.service";

/**
 * POST /v1/webhooks/stripe — public. Stripe calls this directly with its
 * own `Stripe-Signature` header, not a JWT, so this route deliberately
 * carries no auth guard.
 *
 * Needs the *exact raw bytes* Stripe signed for
 * `stripe.webhooks.constructEvent` to verify correctly — NestJS's default
 * body-parser JSON-parses and re-serializes the body, which would break
 * signature verification if we tried to `JSON.stringify(req.body)` back.
 * Fixed by enabling `rawBody: true` in `NestFactory.create` (see
 * `main.ts`), which makes Nest's built-in body-parser middleware preserve
 * the original bytes on `req.rawBody` for every route (JSON parsing for
 * every other route is completely unaffected) — this is the officially
 * supported Nest mechanism for this exact situation, not a hand-rolled
 * raw-body middleware.
 */
@Controller("webhooks/stripe")
export class StripeWebhookController {
  constructor(private readonly stripeWebhookService: StripeWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string | string[] | undefined,
  ): Promise<{ received: boolean }> {
    return this.stripeWebhookService.handleWebhook(req.rawBody, signature);
  }
}
