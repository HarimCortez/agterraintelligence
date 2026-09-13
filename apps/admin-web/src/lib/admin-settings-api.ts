/**
 * `/v1/admin/settings/*` client — types verified against
 * `apps/api/src/admin-settings/dto/admin-settings.dto.ts`, not guessed at.
 * Requires `settings.read` for reads, `settings.write` for editing the
 * permission matrix.
 */
"use client";

import { adminAuthFetch } from "./admin-auth-fetch";
import { ForbiddenError, UnauthorizedError } from "./admin-api-errors";

export type InternalRole =
  | "super_admin"
  | "admin"
  | "support_agent"
  | "data_qa_reviewer"
  | "report_fulfillment_manager"
  | "billing_manager"
  | "ai_model_monitor"
  | "readonly_analyst";

export interface AdminUserRow {
  id: string;
  email: string;
  internalRole: InternalRole;
  status: string;
  mfaEnrolled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PermissionCell {
  role: InternalRole;
  permissionKey: string;
  allowed: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

export interface PermissionMatrix {
  permissionKeys: string[];
  roles: InternalRole[];
  cells: PermissionCell[];
}

export const adminSettingsUsersQueryKey = ["admin-settings", "admin-users"] as const;
export const adminSettingsPermissionsQueryKey = ["admin-settings", "permissions"] as const;

async function handleErrorResponse(res: Response, fallback: string): Promise<never> {
  if (res.status === 401) throw new UnauthorizedError();
  if (res.status === 403) throw new ForbiddenError();
  throw new Error(`${fallback} (HTTP ${res.status})`);
}

export async function fetchAdminUsers(): Promise<{ results: AdminUserRow[] }> {
  const res = await adminAuthFetch("/api/v1/admin/settings/admin-users");
  if (!res.ok) return handleErrorResponse(res, "Failed to load admin users");
  return (await res.json()) as { results: AdminUserRow[] };
}

export async function fetchPermissionMatrix(): Promise<PermissionMatrix> {
  const res = await adminAuthFetch("/api/v1/admin/settings/permissions");
  if (!res.ok) return handleErrorResponse(res, "Failed to load the permission matrix");
  return (await res.json()) as PermissionMatrix;
}

export async function updatePermission(
  role: InternalRole,
  permissionKey: string,
  allowed: boolean,
): Promise<PermissionCell> {
  const res = await adminAuthFetch(
    `/api/v1/admin/settings/permissions/${encodeURIComponent(role)}/${encodeURIComponent(permissionKey)}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed }) },
  );
  if (!res.ok) return handleErrorResponse(res, "Failed to update this permission");
  return (await res.json()) as PermissionCell;
}
