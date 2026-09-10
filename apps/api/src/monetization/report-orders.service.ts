import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, ReportPriceBasis } from "@agterra/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { AccountContext } from "../common/account-context/account-context";
import { PropertiesService } from "../properties/properties.service";
import { StripeClientService } from "./stripe-client.service";
import { ReportTierCode } from "./dto/checkout-report.dto";
import { ReportCheckoutResponseDto, ReportOrderDto } from "./dto/monetization-response.dto";
import { REPORT_CHECKOUT_CANCEL_URL, REPORT_CHECKOUT_SUCCESS_URL } from "./checkout-urls";

@Injectable()
export class ReportOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propertiesService: PropertiesService,
    private readonly stripeClient: StripeClientService,
  ) {}

  /**
   * POST /v1/properties/:id/reports/checkout.
   *
   * Order of operations follows the spec exactly:
   * 1. Property exists (404 otherwise).
   * 2. Tier is valid and purchasable (specific 400 for `premium`/any
   *    human-review tier, not a generic error).
   * 3. Current subscription status picks subscriber vs non-subscriber
   *    pricing.
   * 4. Upgrade-credit computation against this user's own delivered orders
   *    for this same property (scoped query — see step 5).
   * 5. 503 if Stripe isn't configured — checked *before* creating the
   *    `ReportOrder` row, so a missing key never leaves behind an orphaned
   *    `pending_payment` order with no checkout session.
   * 6. Create the `pending_payment` `ReportOrder` (so it has an id for
   *    session metadata), create the Checkout Session, then attach the
   *    session id to the order.
   */
  async createCheckout(
    ctx: AccountContext,
    propertyId: string,
    tier: ReportTierCode,
    userEmail: string,
  ): Promise<ReportCheckoutResponseDto> {
    // 1. Property must exist.
    await this.propertiesService.getPropertyById(propertyId);

    // 2. Tier must exist and be purchasable. Every one of the four DTO-
    // validated codes is seeded (see prisma/seed.ts), so a missing row here
    // would indicate a seed/migration problem, not bad user input — still
    // handled defensively rather than assumed.
    const requestedTier = await this.prisma.reportTier.findUnique({ where: { code: tier } });
    if (!requestedTier) {
      throw new BadRequestException(`Unknown report tier: ${tier}`);
    }
    if (requestedTier.requiresHumanReview) {
      throw new BadRequestException("Premium reports are not yet available for purchase");
    }

    // 3 & 4. Subscription status for pricing, and this user's own delivered
    // orders for this property for upgrade-credit / already-owns checks.
    // Both queries are scoped directly by `ctx.scopeId` in the `where`
    // clause itself — never "fetch then filter in JS" — matching the
    // corrected `saved-searches.service.ts` ownership pattern.
    const [subscription, deliveredOrders, allTiers] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { userId: ctx.scopeId } }),
      this.prisma.reportOrder.findMany({
        where: { propertyId, userId: ctx.scopeId, status: "delivered" },
      }),
      this.prisma.reportTier.findMany(),
    ]);

    const tierByCode = new Map(allTiers.map((t) => [t.code, t]));
    const requestedSortOrder = requestedTier.sortOrder;

    let creditSourceOrder: (typeof deliveredOrders)[number] | undefined;
    for (const order of deliveredOrders) {
      const orderTier = tierByCode.get(order.reportTierCode);
      if (!orderTier) continue; // defensive: a tier row was removed after the order was placed.

      if (orderTier.sortOrder >= requestedSortOrder) {
        throw new ConflictException("You already have this report tier or higher for this property");
      }

      const currentCreditSortOrder = creditSourceOrder
        ? tierByCode.get(creditSourceOrder.reportTierCode)?.sortOrder ?? -1
        : -1;
      if (orderTier.sortOrder > currentCreditSortOrder) {
        creditSourceOrder = order;
      }
    }

    const isActiveSubscriber = subscription?.status === "active";
    const basePriceCents = isActiveSubscriber
      ? requestedTier.subscriberPriceCents
      : requestedTier.nonSubscriberPriceCents;
    const priceBasis: ReportPriceBasis = isActiveSubscriber
      ? ReportPriceBasis.subscriber
      : ReportPriceBasis.non_subscriber;

    // Upgrade-credit rule (ARCHITECTURE.md Implementation Constraint #4):
    // computed against the price the user actually paid for the lower
    // tier, never against that tier's list price. Floored at 0 — never
    // negative — on both the credit itself (never more than the new
    // tier's price) and the resulting final price.
    const upgradeCreditAppliedCents = creditSourceOrder
      ? Math.min(creditSourceOrder.pricePaidCents, basePriceCents)
      : 0;
    const finalPriceCents = Math.max(basePriceCents - upgradeCreditAppliedCents, 0);

    // 5. Fail clean with 503 before creating anything if Stripe isn't
    // configured — no Stripe account/keys are provisioned yet.
    const stripe = this.stripeClient.getClient();

    // 6a. Create the pending order first — gives us an id for session
    // metadata, per this endpoint's spec.
    const order = await this.prisma.reportOrder.create({
      data: {
        userId: ctx.scopeId,
        propertyId,
        reportTierCode: tier,
        pricePaidCents: finalPriceCents,
        priceBasis,
        upgradeCreditAppliedCents,
        status: "pending_payment",
      },
    });

    // 6b. Create the Checkout Session using the final computed price.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `AgTerra ${requestedTier.displayName} Report` },
            unit_amount: finalPriceCents,
          },
          quantity: 1,
        },
      ],
      success_url: REPORT_CHECKOUT_SUCCESS_URL,
      cancel_url: REPORT_CHECKOUT_CANCEL_URL,
      customer_email: userEmail,
      metadata: { reportOrderId: order.id },
      // Managed Payments (enabled by default on this Stripe account) requires
      // a `tax_code` on every inline product_data line item, which we don't
      // set — Stripe Tax isn't configured yet (see REQUIREMENTS.md decision
      // log). Disable it explicitly for now rather than fabricating tax
      // codes; revisit together when Stripe Tax gets built.
      managed_payments: { enabled: false },
    });

    if (!session.url) {
      throw new ServiceUnavailableException("Stripe did not return a checkout URL");
    }

    // 6c. Attach the session id to the order.
    await this.prisma.reportOrder.update({
      where: { id: order.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return {
      checkoutUrl: session.url,
      orderId: order.id,
      priceCents: finalPriceCents,
      upgradeCreditAppliedCents,
    };
  }

  /**
   * GET /v1/properties/:id/reports. Scoped to `(propertyId, userId)` in the
   * query itself — this user's own orders for this property only.
   */
  async listForProperty(ctx: AccountContext, propertyId: string): Promise<ReportOrderDto[]> {
    await this.propertiesService.getPropertyById(propertyId);

    const orders = await this.prisma.reportOrder.findMany({
      where: { propertyId, userId: ctx.scopeId },
      orderBy: { createdAt: "desc" },
    });

    return orders.map(toReportOrderDto);
  }

  /**
   * GET /v1/report-orders/:id. Ownership check is baked into the query
   * itself (`findFirst` with both `id` and `userId` in the same `where`),
   * not "fetch by id, then check ownership after" — the exact class of bug
   * the corrected `saved-searches.service.ts` update method fixed. 404 for
   * both "doesn't exist" and "exists but isn't yours", never distinguished.
   */
  async getById(ctx: AccountContext, id: string): Promise<ReportOrderDto> {
    const order = await this.prisma.reportOrder.findFirst({
      where: { id, userId: ctx.scopeId },
    });

    if (!order) {
      throw new NotFoundException(`ReportOrder with id ${id} not found`);
    }

    return toReportOrderDto(order);
  }
}

interface ReportOrderRow {
  id: string;
  propertyId: string;
  reportTierCode: string;
  pricePaidCents: number;
  priceBasis: string;
  upgradeCreditAppliedCents: number;
  status: string;
  content: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

function toReportOrderDto(order: ReportOrderRow): ReportOrderDto {
  return {
    id: order.id,
    propertyId: order.propertyId,
    reportTierCode: order.reportTierCode,
    pricePaidCents: order.pricePaidCents,
    priceBasis: order.priceBasis,
    upgradeCreditAppliedCents: order.upgradeCreditAppliedCents,
    status: order.status,
    content: order.content,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
