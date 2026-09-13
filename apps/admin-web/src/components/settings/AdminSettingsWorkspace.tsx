"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminSettingsPermissionsQueryKey,
  adminSettingsUsersQueryKey,
  fetchAdminUsers,
  fetchPermissionMatrix,
  updatePermission,
  type InternalRole,
} from "@/lib/admin-settings-api";
import { useHandleAdminUnauthorized } from "@/lib/use-handle-admin-unauthorized";
import { formatDate, formatEnumLabel } from "@/lib/formatters";
import { ForbiddenError } from "@/lib/admin-api-errors";

/**
 * `/settings` — Administration Settings (REQUIREMENTS.md Section 9/10.2),
 * scoped to what's real: the actual admin_users list and a real, editable
 * role_permissions matrix — the exact table every other admin module's
 * access control has been checking against all session. Everything else
 * in REQUIREMENTS.md's fuller spec (branding, notifications, integrations,
 * retention, compliance, maintenance mode, danger zone) has no real
 * backing system yet and isn't faked here.
 */
export function AdminSettingsWorkspace() {
  const handleUnauthorized = useHandleAdminUnauthorized();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({ queryKey: adminSettingsUsersQueryKey, queryFn: fetchAdminUsers });
  const permissionsQuery = useQuery({ queryKey: adminSettingsPermissionsQueryKey, queryFn: fetchPermissionMatrix });

  useEffect(() => {
    if (usersQuery.error) handleUnauthorized(usersQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usersQuery.error]);
  useEffect(() => {
    if (permissionsQuery.error) handleUnauthorized(permissionsQuery.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsQuery.error]);

  const toggleMutation = useMutation({
    mutationFn: ({ role, permissionKey, allowed }: { role: InternalRole; permissionKey: string; allowed: boolean }) =>
      updatePermission(role, permissionKey, allowed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSettingsPermissionsQueryKey }),
    onError: handleUnauthorized,
  });

  if (usersQuery.isError && usersQuery.error instanceof ForbiddenError) {
    return (
      <div className="p-xl">
        <div className="rounded border border-border-subtle bg-surface p-lg text-sm text-text-secondary">
          {usersQuery.error.message}
        </div>
      </div>
    );
  }

  const matrix = permissionsQuery.data;

  return (
    <div className="p-xl">
      <header className="mb-lg">
        <h1 className="text-2xl font-semibold text-text-primary">Administration Settings</h1>
        <p className="text-sm text-text-secondary">Admin users and the role→permission matrix that gates every admin screen.</p>
      </header>

      <section className="mb-xl">
        <h2 className="mb-md text-lg font-semibold text-text-primary">Admin users</h2>
        <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
                <th className="px-md py-sm">Email</th>
                <th className="px-md py-sm">Role</th>
                <th className="px-md py-sm">Status</th>
                <th className="px-md py-sm">MFA</th>
                <th className="px-md py-sm">Created</th>
                <th className="px-md py-sm">Last login</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.isPending && (
                <tr>
                  <td className="px-md py-md text-text-secondary" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              )}
              {usersQuery.isSuccess &&
                usersQuery.data.results.map((admin) => (
                  <tr key={admin.id} className="border-b border-border-subtle last:border-b-0">
                    <td className="px-md py-sm text-text-primary">{admin.email}</td>
                    <td className="px-md py-sm capitalize text-text-primary">{formatEnumLabel(admin.internalRole)}</td>
                    <td className="px-md py-sm capitalize text-text-secondary">{formatEnumLabel(admin.status)}</td>
                    <td className="px-md py-sm text-text-secondary">{admin.mfaEnrolled ? "Enrolled" : "Not enrolled"}</td>
                    <td className="px-md py-sm text-text-secondary">{formatDate(admin.createdAt)}</td>
                    <td className="px-md py-sm text-text-secondary">
                      {admin.lastLoginAt ? formatDate(admin.lastLoginAt) : "Never"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-xs text-lg font-semibold text-text-primary">Role permissions</h2>
        <p className="mb-md text-sm text-text-secondary">
          Toggling a cell takes effect immediately — it changes what every admin with that role can access right now.
        </p>
        {toggleMutation.isError && !(toggleMutation.error instanceof ForbiddenError) && (
          <p role="alert" className="mb-sm text-sm text-risk-high-bg">
            {toggleMutation.error instanceof Error ? toggleMutation.error.message : "Failed to update this permission."}
          </p>
        )}
        {toggleMutation.isError && toggleMutation.error instanceof ForbiddenError && (
          <p role="alert" className="mb-sm text-sm text-text-secondary">
            {toggleMutation.error.message}
          </p>
        )}
        <div className="overflow-x-auto rounded border border-border-subtle bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-text-secondary">
                <th className="sticky left-0 bg-surface px-md py-sm">Permission</th>
                {matrix?.roles.map((role) => (
                  <th key={role} className="whitespace-nowrap px-md py-sm text-center">
                    {formatEnumLabel(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionsQuery.isPending && (
                <tr>
                  <td className="px-md py-md text-text-secondary" colSpan={9}>
                    Loading…
                  </td>
                </tr>
              )}
              {matrix?.permissionKeys.map((permissionKey) => (
                <tr key={permissionKey} className="border-b border-border-subtle last:border-b-0">
                  <td className="sticky left-0 bg-surface px-md py-sm text-text-primary">{permissionKey}</td>
                  {matrix.roles.map((role) => {
                    const cell = matrix.cells.find((c) => c.role === role && c.permissionKey === permissionKey);
                    const isPending =
                      toggleMutation.isPending &&
                      toggleMutation.variables?.role === role &&
                      toggleMutation.variables?.permissionKey === permissionKey;
                    return (
                      <td key={role} className="px-md py-sm text-center" title={cell?.updatedByEmail ? `Last changed by ${cell.updatedByEmail} on ${formatDate(cell.updatedAt!)}` : undefined}>
                        <input
                          type="checkbox"
                          checked={cell?.allowed ?? false}
                          disabled={isPending}
                          onChange={(e) => toggleMutation.mutate({ role, permissionKey, allowed: e.target.checked })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
