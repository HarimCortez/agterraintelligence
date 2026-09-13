import { AdminUserStatus, InternalRole } from "@agterra/db";

export interface AdminUserRowDto {
  id: string;
  email: string;
  internalRole: InternalRole;
  status: AdminUserStatus;
  mfaEnrolled: boolean;
  createdAt: Date;
  /** Derived from the most recent real `admin.login.success` audit entry for this admin — null if they've never logged in (e.g. provisioned but not yet activated). */
  lastLoginAt: Date | null;
}

export interface ListAdminUsersResponseDto {
  results: AdminUserRowDto[];
}

export interface PermissionCellDto {
  role: InternalRole;
  permissionKey: string;
  allowed: boolean;
  updatedAt: Date | null;
  updatedByEmail: string | null;
}

export interface PermissionMatrixResponseDto {
  /** Every distinct permission_key currently in role_permissions, sorted — the real, live set, not a hardcoded list. */
  permissionKeys: string[];
  /** All 8 InternalRole values, in enum declaration order. */
  roles: InternalRole[];
  /** One cell per (role, permissionKey) pair — including pairs with no row at all, shown as allowed=false, matching PermissionsService's real fail-closed runtime behavior. */
  cells: PermissionCellDto[];
}

export interface UpdatePermissionResponseDto {
  role: InternalRole;
  permissionKey: string;
  allowed: boolean;
}
