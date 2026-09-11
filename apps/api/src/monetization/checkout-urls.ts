/**
 * Frontend redirect URLs for Stripe Checkout Sessions. `/account`
 * (`AccountWorkspace`) reads the `?checkout=success|cancelled` param to
 * show a confirmation banner and refetch subscription status, so these
 * must point there specifically, not just the site root. `FRONTEND_URL`
 * defaults to the local dev server; production sets it to the real
 * deployed origin so a live checkout doesn't redirect a paying user to
 * localhost (caught via a real end-to-end checkout against production,
 * which landed on a dead http://localhost:3000/account URL before that
 * fix).
 */
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

export const SUBSCRIPTION_CHECKOUT_SUCCESS_URL = `${FRONTEND_URL}/account?checkout=success`;
export const SUBSCRIPTION_CHECKOUT_CANCEL_URL = `${FRONTEND_URL}/account?checkout=cancelled`;
export const REPORT_CHECKOUT_SUCCESS_URL = `${FRONTEND_URL}/account?checkout=success`;
export const REPORT_CHECKOUT_CANCEL_URL = `${FRONTEND_URL}/account?checkout=cancelled`;

/** Where Stripe's hosted Billing Portal sends the user back after they're done. */
export const BILLING_PORTAL_RETURN_URL = `${FRONTEND_URL}/account`;
