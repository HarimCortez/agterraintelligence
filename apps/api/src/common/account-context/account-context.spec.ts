import { AccountContext } from "./account-context";

describe("AccountContext", () => {
  it("resolves scopeId to the user's own id when orgId is null (MVP default for every user)", () => {
    const ctx = AccountContext.forUser({ id: "user-1", orgId: null });
    expect(ctx.scopeId).toBe("user-1");
    expect(ctx.userId).toBe("user-1");
    expect(ctx.isOrgScoped).toBe(false);
  });

  it("resolves scopeId to the org id once org_id is populated — the org-seam activation path", () => {
    const ctx = AccountContext.forUser({ id: "user-1", orgId: "org-9" });
    expect(ctx.scopeId).toBe("org-9");
    expect(ctx.userId).toBe("user-1");
    expect(ctx.isOrgScoped).toBe(true);
  });

  it("treats undefined orgId the same as null (defensive — Prisma always returns null, not undefined, for a nullable column)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately feeding a malformed identity to prove the fallback
    const ctx = AccountContext.forUser({ id: "user-2", orgId: undefined as any });
    expect(ctx.scopeId).toBe("user-2");
    expect(ctx.isOrgScoped).toBe(false);
  });
});
