/**
 * `/v1/admin/audit/*` client — types verified against
 * `apps/api/src/admin-audit/dto/admin-audit.dto.ts`, not guessed at.
 * Requires `audit.read` server-side.
 */
"use client";

import { adminAuthFetch } from "./admin-auth-fetch";
import { ForbiddenError, UnauthorizedError } from "./admin-api-errors";

export interface AuditLogRow {
  id: string;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

interface Paginated<T> {
  results: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListAuditLogParams {
  action?: string;
  actorEmail?: string;
  limit?: number;
  offset?: number;
}

export const adminAuditLogQueryKey = (params: ListAuditLogParams) => ["admin-audit", "entries", params] as const;

export async function fetchAdminAuditLog(params: ListAuditLogParams): Promise<Paginated<AuditLogRow>> {
  const search = new URLSearchParams();
  if (params.action) search.set("action", params.action);
  if (params.actorEmail) search.set("actorEmail", params.actorEmail);
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));

  const res = await adminAuthFetch(`/api/v1/admin/audit/entries?${search.toString()}`);
  if (!res.ok) {
    if (res.status === 401) throw new UnauthorizedError();
    if (res.status === 403) throw new ForbiddenError();
    throw new Error(`Failed to load audit log (HTTP ${res.status})`);
  }
  return (await res.json()) as Paginated<AuditLogRow>;
}
