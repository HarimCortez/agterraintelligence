/**
 * Placeholder frontend redirect URLs for Stripe Checkout Sessions. `fe`
 * will wire real success/cancel destinations later — these exist purely so
 * Checkout Session creation has *some* valid absolute URL to redirect to
 * (Stripe requires one), matching the pattern of every other "frontend
 * isn't built yet" seam in this codebase (e.g. AI Analyst shipping public
 * pending real login UI).
 */
export const SUBSCRIPTION_CHECKOUT_SUCCESS_URL = "http://localhost:3000/account?checkout=success";
export const SUBSCRIPTION_CHECKOUT_CANCEL_URL = "http://localhost:3000/account?checkout=cancelled";
export const REPORT_CHECKOUT_SUCCESS_URL = "http://localhost:3000/account?checkout=success";
export const REPORT_CHECKOUT_CANCEL_URL = "http://localhost:3000/account?checkout=cancelled";
