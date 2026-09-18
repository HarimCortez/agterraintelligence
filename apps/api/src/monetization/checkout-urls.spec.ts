describe("checkout-urls — report checkout URL builders", () => {
  const ORIGINAL_ENV = process.env.FRONTEND_URL;

  afterEach(() => {
    process.env.FRONTEND_URL = ORIGINAL_ENV;
    jest.resetModules();
  });

  it("buildReportCheckoutSuccessUrl points at the report order's own workspace screen", () => {
    delete process.env.FRONTEND_URL;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildReportCheckoutSuccessUrl } = require("./checkout-urls");

    expect(buildReportCheckoutSuccessUrl("order-123")).toBe(
      "http://localhost:3000/report-orders/order-123?checkout=success",
    );
  });

  it("buildReportCheckoutCancelUrl points back at the tier-selection screen for the same property", () => {
    delete process.env.FRONTEND_URL;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildReportCheckoutCancelUrl } = require("./checkout-urls");

    expect(buildReportCheckoutCancelUrl("property-456")).toBe(
      "http://localhost:3000/properties/property-456/reports?checkout=cancelled",
    );
  });

  it("both builders respect a configured FRONTEND_URL", () => {
    process.env.FRONTEND_URL = "https://app.agterra.com";
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildReportCheckoutSuccessUrl, buildReportCheckoutCancelUrl } = require("./checkout-urls");

    expect(buildReportCheckoutSuccessUrl("order-abc")).toBe(
      "https://app.agterra.com/report-orders/order-abc?checkout=success",
    );
    expect(buildReportCheckoutCancelUrl("property-xyz")).toBe(
      "https://app.agterra.com/properties/property-xyz/reports?checkout=cancelled",
    );
  });

  it("leaves the subscription checkout URLs untouched (static constants, unaffected by this change)", () => {
    delete process.env.FRONTEND_URL;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const urls = require("./checkout-urls");

    expect(urls.SUBSCRIPTION_CHECKOUT_SUCCESS_URL).toBe("http://localhost:3000/account?checkout=success");
    expect(urls.SUBSCRIPTION_CHECKOUT_CANCEL_URL).toBe("http://localhost:3000/account?checkout=cancelled");
  });
});
