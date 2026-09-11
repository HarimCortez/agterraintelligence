import { ReportOrderStatus, ReportPriceBasis } from "@agterra/db";

/** GET /v1/admin/fulfillment/summary */
export interface AdminFulfillmentSummaryDto {
  ordersByStatus: Record<string, number>;
  /** Average (`updatedAt - createdAt`) across `delivered` orders only, in seconds. `null` if none are delivered yet — not 0, which would misleadingly read as "instant." */
  averageFulfillmentSeconds: number | null;
  /** Count of orders in `failed` status right now — the operational "needs attention" number. */
  failedOrderCount: number;
}

export interface AdminFulfillmentOrderRowDto {
  id: string;
  userEmail: string;
  propertyId: string;
  propertyAddress: string;
  reportTierCode: string;
  status: ReportOrderStatus;
  createdAt: Date;
  updatedAt: Date;
  hasContent: boolean;
}

export interface ListAdminFulfillmentOrdersResponseDto {
  results: AdminFulfillmentOrderRowDto[];
  total: number;
  limit: number;
  offset: number;
}

/** GET /v1/admin/fulfillment/orders/:id — includes the full generated report content, for admin review. */
export interface AdminFulfillmentOrderDetailDto extends AdminFulfillmentOrderRowDto {
  pricePaidCents: number;
  priceBasis: ReportPriceBasis;
  content: unknown;
}

/** POST /v1/admin/fulfillment/orders/:id/retry */
export interface RetryFulfillmentResponseDto {
  id: string;
  status: ReportOrderStatus;
}
