import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { PrismaService } from "../common/prisma/prisma.service";
import { TokenService } from "../identity-access/tokens/token.service";
import { JwtAuthGuard } from "../identity-access/investor/jwt-auth.guard";
import { AccountContext } from "../common/account-context/account-context";
import { PropertyReportsController } from "./property-reports.controller";
import { ReportOrdersService } from "./report-orders.service";
import { ReportPricingDto } from "./dto/monetization-response.dto";

const PROPERTY_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

describe("PropertyReportsController", () => {
  let controller: PropertyReportsController;

  const reportOrdersServiceMock = {
    listForProperty: jest.fn(),
    createCheckout: jest.fn(),
    previewPricing: jest.fn(),
  };

  // Real JwtAuthGuard, wired with mocked lower-level dependencies (same
  // pattern as jwt-auth.guard.spec.ts) — used below to actually exercise
  // the 401 behavior on the new route, not just check guard metadata.
  const prismaUserMock = { findUnique: jest.fn() };
  const config = new ConfigService({ JWT_INVESTOR_ACCESS_SECRET: "investor-access-secret" });
  let guard: JwtAuthGuard;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [PropertyReportsController],
      providers: [
        { provide: ReportOrdersService, useValue: reportOrdersServiceMock },
        JwtAuthGuard,
        TokenService,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: { user: prismaUserMock } },
      ],
    }).compile();

    controller = moduleRef.get(PropertyReportsController);
    guard = moduleRef.get(JwtAuthGuard);
  });

  it("requires authentication on every route (class-level @UseGuards(JwtAuthGuard), including the new pricing route which has no route-level override)", () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, PropertyReportsController) ?? [];
    expect(guards).toContain(JwtAuthGuard);

    // No method-level guard override on `previewPricing` — it inherits the
    // class-level guard, same as `list`/`checkout`.
    const methodGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controller.previewPricing) ?? [];
    expect(methodGuards).toHaveLength(0);
  });

  it("401s an unauthenticated request to the pricing route via the real JwtAuthGuard (no bearer token)", async () => {
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(reportOrdersServiceMock.previewPricing).not.toHaveBeenCalled();
  });

  it("GET /properties/:id/reports/pricing scopes the pricing preview by the requesting investor's AccountContext and returns the service's DTO shape verbatim", async () => {
    const ctx = AccountContext.forUser({ id: USER_ID, orgId: null });
    const pricing: ReportPricingDto[] = [
      {
        tierCode: "essential",
        displayName: "Essential",
        purchasable: true,
        priceCents: 7350,
        priceBasis: "non_subscriber",
        upgradeCreditAppliedCents: 0,
        netPriceCents: 7350,
      },
    ];
    reportOrdersServiceMock.previewPricing.mockResolvedValue(pricing);

    const result = await controller.previewPricing(ctx, PROPERTY_ID);

    expect(reportOrdersServiceMock.previewPricing).toHaveBeenCalledWith(ctx, PROPERTY_ID);
    expect(result).toBe(pricing);
  });
});
