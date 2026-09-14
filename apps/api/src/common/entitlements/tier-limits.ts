import { ExternalRole } from "@agterra/db";

/**
 * Watchlist and Saved Search caps per external tier — closes
 * REQUIREMENTS.md decision log item 8's tracked gap ("tier-based limits ...
 * are not enforced"). These exact numbers were not in the PRD (it only
 * says Free gets a "limited watchlist," citing a table that was never
 * transcribed with real figures) — confirmed directly by the Product Owner
 * rather than invented: Free 5/3, Basic 25/15, Investor tier and above
 * unlimited (`null`). See REQUIREMENTS.md's decision log for the dated
 * entry.
 *
 * `team_admin`/`team_member` are dormant per Decision 1 (no `org_id` is
 * ever populated in MVP) — given no real limit for them was ever product-
 * decided, they default to unlimited rather than inheriting Free's cap,
 * since an org-scoped seat is conceptually closer to Investor+ than to a
 * brand-new free signup.
 */
export const WATCHLIST_LIMITS: Record<ExternalRole, number | null> = {
  free: 5,
  basic_subscriber: 25,
  investor_subscriber: null,
  professional_subscriber: null,
  institutional: null,
  team_admin: null,
  team_member: null,
};

export const SAVED_SEARCH_LIMITS: Record<ExternalRole, number | null> = {
  free: 3,
  basic_subscriber: 15,
  investor_subscriber: null,
  professional_subscriber: null,
  institutional: null,
  team_admin: null,
  team_member: null,
};
