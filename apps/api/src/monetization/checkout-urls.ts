/**
 * Placeholder frontend redirect URLs for Stripe Checkout Sessions. There's
 * no dedicated /account page built yet — `fe` will wire a real destination
 * later — so these point at the frontend's home page (Discover) rather
 * than a route that doesn't exist. `FRONTEND_URL` defaults to the local
 * dev server; production sets it to the real deployed origin so a live
 * checkout doesn't redirect a paying user to localhost (caught via a real
 * end-to-end checkout against production, which landed on a dead
 * http://localhost:3000/account URL before this fix).
 */
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

export const SUBSCRIPTION_CHECKOUT_SUCCESS_URL = `${FRONTEND_URL}/?checkout=success`;
export const SUBSCRIPTION_CHECKOUT_CANCEL_URL = `${FRONTEND_URL}/?checkout=cancelled`;
export const REPORT_CHECKOUT_SUCCESS_URL = `${FRONTEND_URL}/?checkout=success`;
export const REPORT_CHECKOUT_CANCEL_URL = `${FRONTEND_URL}/?checkout=cancelled`;
