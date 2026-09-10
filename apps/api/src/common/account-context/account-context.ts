/**
 * Minimal shape `AccountContext` needs to resolve an account-scoped
 * identity. Deliberately structural (not the full Prisma `User` model) so
 * it can be built from a JWT-derived request user, a full Prisma record, or
 * a hand-built object in a test — no dependency on `@agterra/db` here.
 */
export interface AccountScopedIdentity {
  id: string;
  orgId: string | null;
}

/**
 * Org-seam abstraction — the direct technical fulfillment of Product
 * Decision 1 (ARCHITECTURE.md "Authentication / Authorization" > "Org-seam
 * requirement"; also "Implementation Constraints" #1).
 *
 * Every account-scoped query or permission check, in every domain module
 * (this one and every one added in later phases), must resolve its tenant
 * boundary through `scopeId` — never by comparing against a raw `user.id`
 * as the sole boundary. That is what lets the org layer activate later
 * (populate `users.org_id`) as a data migration, not a code change spread
 * across every module that does tenant-scoped queries.
 *
 * Today `org_id` is null for every MVP user, so `scopeId === userId` for
 * everyone — this class is what makes that fact invisible to callers, both
 * now and once orgs activate.
 *
 * Usage in a future domain module, e.g. watchlists:
 *
 *   async listForAccount(ctx: AccountContext) {
 *     return this.prisma.watchlistItem.findMany({ where: { accountScopeId: ctx.scopeId } });
 *   }
 *
 * — never `where: { userId: currentUser.id }` directly.
 */
export class AccountContext {
  private constructor(
    public readonly userId: string,
    public readonly orgId: string | null,
  ) {}

  static forUser(user: AccountScopedIdentity): AccountContext {
    return new AccountContext(user.id, user.orgId ?? null);
  }

  /** The effective tenant boundary: the org id if the user belongs to one, else the user's own id. */
  get scopeId(): string {
    return this.orgId ?? this.userId;
  }

  /** True once org support is active for this account (always false in MVP). */
  get isOrgScoped(): boolean {
    return this.orgId !== null;
  }
}
