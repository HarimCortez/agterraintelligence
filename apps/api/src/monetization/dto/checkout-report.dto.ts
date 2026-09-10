import { IsIn } from "class-validator";

/**
 * All four `ReportTier` codes, including `premium` — deliberately NOT
 * restricted to the three purchasable tiers at the DTO layer. A request for
 * `premium` must reach `ReportOrdersService` and get the specific, clear
 * "Premium reports are not yet available for purchase" 400 (per this
 * endpoint's spec) rather than a generic validation-error 400 that reads
 * the same as any other malformed input. Anything outside these four known
 * codes still gets rejected here as a normal validation error.
 */
export const ALL_REPORT_TIER_CODES = ["essential", "investor", "professional", "premium"] as const;
export type ReportTierCode = (typeof ALL_REPORT_TIER_CODES)[number];

export class CheckoutReportDto {
  @IsIn(ALL_REPORT_TIER_CODES)
  tier!: ReportTierCode;
}
