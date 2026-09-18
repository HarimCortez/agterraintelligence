import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, ReportOrder, ReportPriceBasis, ReportTier, Subscription } from "@agterra/db";
import { PrismaService } from "../common/prisma/prisma.service";
import { AccountContext } from "../common/account-context/account-context";
import { PropertiesService } from "../properties/properties.service";
import { StripeClientService } from "./stripe-client.service";
import { ReportTierCode } from "./dto/checkout-report.dto";
import { ReportCheckoutResponseDto, ReportOrderDto, ReportPricingDto } from "./dto/monetization-response.dto";
import { buildReportCheckoutCancelUrl, buildReportCheckoutSuccessUrl } from "./checkout-urls";

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

    // 3. Reject if the user already owns this tier or higher as a delivered
    // order for this property. This ownership check reuses the same
    // `deliveredOrders`/`allTiers` fetched below for pricing (single query
    // each, not a second redundant round-trip) — it only considers *lower*
    // delivered tiers as an error condition here; `computeTierPricingFromData`
    // never flags "already own this exact tier or higher" itself, since the
    // preview endpoint must never throw for an already-owned tier (it just
    // previews price).
    const pricingInputs = await this.fetchPricingInputs(ctx, propertyId);
    const { deliveredOrders, allTiers } = pricingInputs;
    const tierByCode = new Map(allTiers.map((t) => [t.code, t]));
    for (const order of deliveredOrders) {
      const orderTier = tierByCode.get(order.reportTierCode);
      if (orderTier && orderTier.sortOrder >= requestedTier.sortOrder) {
        throw new ConflictException("You already have this report tier or higher for this property");
      }
    }

    // 4. Shared subscriber/credit pricing formula — the exact same formula
    // backs `GET /v1/properties/:id/reports/pricing`, per the architecture
    // doc's "single source of truth" constraint (FR4). Computed from the
    // `pricingInputs` already fetched above rather than re-querying.
    const pricingByTier = this.computeTierPricingFromData(pricingInputs);
    const pricing = pricingByTier.find((p) => p.tierCode === tier);
    if (!pricing) {
      // Defensive: requestedTier existed moments ago in step 2; a row
      // removed out from under an in-flight request would land here.
      throw new BadRequestException(`Unknown report tier: ${tier}`);
    }
    const finalPriceCents = pricing.netPriceCents;
    const priceBasis = pricing.priceBasis as ReportPriceBasis;
    const upgradeCreditAppliedCents = pricing.upgradeCreditAppliedCents;

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
      success_url: buildReportCheckoutSuccessUrl(order.id),
      cancel_url: buildReportCheckoutCancelUrl(propertyId),
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
   * GET /v1/properties/:id/reports/pricing. Read-only preview across all
   * four seeded tiers, backed by the exact same formula `createCheckout`
   * uses (`computeTierPricing`) — no write, no Stripe call.
   */
  async previewPricing(ctx: AccountContext, propertyId: string): Promise<ReportPricingDto[]> {
    await this.propertiesService.getPropertyById(propertyId);
    const pricingInputs = await this.fetchPricingInputs(ctx, propertyId);
    return this.computeTierPricingFromData(pricingInputs);
  }

  /**
   * Fetches the raw data the pricing formula (and `createCheckout`'s
   * ownership check) is computed from. Split out from
   * `computeTierPricingFromData` purely to avoid the redundant double fetch
   * that previously existed: `createCheckout` needs `deliveredOrders`/
   * `allTiers` for its own "already owns this tier or higher" 409 check
   * *and* for pricing, so it fetches once here and reuses the same result
   * for both, rather than querying twice. `previewPricing` has no other
   * caller to share a fetch with, so it just calls this and the formula
   * back to back.
   */
  private async fetchPricingInputs(ctx: AccountContext, propertyId: string): Promise<PricingInputs> {
    const [subscription, deliveredOrders, allTiers] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { userId: ctx.scopeId } }),
      this.prisma.reportOrder.findMany({
        where: { propertyId, userId: ctx.scopeId, status: "delivered" },
      }),
      this.prisma.reportTier.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);

    return { subscription, deliveredOrders, allTiers };
  }

  /**
   * Shared subscriber/credit pricing formula, generalized across all
   * seeded `ReportTier` rows (ordered by `sortOrder`). This is the single
   * source of truth `createCheckout` and `previewPricing` both call — the
   * architecture doc's explicit "do not implement the formula twice"
   * constraint (backs requirements FR4: the frontend must never
   * independently recompute or estimate this value). Pure/synchronous —
   * takes already-fetched data (see `fetchPricingInputs`) rather than
   * querying itself, so callers control how many times the underlying
   * queries actually run.
   *
   * Only *lower* delivered tiers contribute upgrade credit for a given
   * tier — this method never throws for an already-owned tier or higher;
   * that's a separate ownership check `createCheckout` makes on its own,
   * since a pricing preview must never error just because a tier is
   * already owned.
   */
  private computeTierPricingFromData({ subscription, deliveredOrders, allTiers }: PricingInputs): ReportPricingDto[] {
    const tierByCode = new Map(allTiers.map((t) => [t.code, t]));
    const isActiveSubscriber = subscription?.status === "active";

    return allTiers.map((tier) => {
      // Highest-sort-order delivered order strictly below this tier, if any.
      let creditSourceOrder: (typeof deliveredOrders)[number] | undefined;
      for (const order of deliveredOrders) {
        const orderTier = tierByCode.get(order.reportTierCode);
        if (!orderTier) continue; // defensive: tier row removed after the order was placed.
        if (orderTier.sortOrder >= tier.sortOrder) continue; // only lower tiers contribute credit.

        const currentCreditSortOrder = creditSourceOrder
          ? tierByCode.get(creditSourceOrder.reportTierCode)?.sortOrder ?? -1
          : -1;
        if (orderTier.sortOrder > currentCreditSortOrder) {
          creditSourceOrder = order;
        }
      }

      const priceCents = isActiveSubscriber ? tier.subscriberPriceCents : tier.nonSubscriberPriceCents;
      const priceBasis: ReportPriceBasis = isActiveSubscriber
        ? ReportPriceBasis.subscriber
        : ReportPriceBasis.non_subscriber;

      // Upgrade-credit rule (ARCHITECTURE.md Implementation Constraint #4):
      // computed against the price the user actually paid for the lower
      // tier, never against that tier's list price. Floored at 0 — never
      // negative — on both the credit itself (never more than the new
      // tier's price) and the resulting final price.
      const upgradeCreditAppliedCents = creditSourceOrder
        ? Math.min(creditSourceOrder.pricePaidCents, priceCents)
        : 0;
      const netPriceCents = Math.max(priceCents - upgradeCreditAppliedCents, 0);

      return {
        tierCode: tier.code,
        displayName: tier.displayName,
        purchasable: !tier.requiresHumanReview,
        priceCents,
        priceBasis,
        upgradeCreditAppliedCents,
        netPriceCents,
      };
    });
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

/**
 * Raw inputs the pricing formula (`computeTierPricingFromData`) is derived
 * from — fetched once via `fetchPricingInputs` and shared between
 * `createCheckout`'s ownership check and its pricing computation, instead
 * of each querying `reportOrder`/`reportTier` separately.
 */
interface PricingInputs {
  subscription: Subscription | null;
  deliveredOrders: ReportOrder[];
  allTiers: ReportTier[];
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
