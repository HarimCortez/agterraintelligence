import { TokenService } from "./token.service";

describe("TokenService", () => {
  let tokens: TokenService;

  beforeEach(() => {
    tokens = new TokenService();
  });

  const baseOptions = { secret: "s3cret", issuer: "agterra-test", audience: "agterra-test-aud", expiresIn: "15m" };

  it("round-trips a signed token through verifyToken with matching secret/issuer/audience", async () => {
    const token = await tokens.signToken({ sub: "user-1" }, baseOptions);
    const payload = await tokens.verifyToken<{ sub: string }>(token, baseOptions);
    expect(payload.sub).toBe("user-1");
  });

  it("rejects verification with a different secret — the core of the two-plane isolation", async () => {
    const token = await tokens.signToken({ sub: "user-1" }, baseOptions);
    await expect(tokens.verifyToken(token, { ...baseOptions, secret: "different-secret" })).rejects.toThrow();
  });

  it("rejects verification with a different audience (e.g. an admin token presented against investor options)", async () => {
    const token = await tokens.signToken({ sub: "user-1" }, baseOptions);
    await expect(tokens.verifyToken(token, { ...baseOptions, audience: "agterra-other-aud" })).rejects.toThrow();
  });

  it("rejects verification with a different issuer", async () => {
    const token = await tokens.signToken({ sub: "user-1" }, baseOptions);
    await expect(tokens.verifyToken(token, { ...baseOptions, issuer: "some-other-issuer" })).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await tokens.signToken({ sub: "user-1" }, { ...baseOptions, expiresIn: "1s" });
    const realNow = Date.now;
    Date.now = () => realNow() + 2_000;
    try {
      await expect(tokens.verifyToken(token, baseOptions)).rejects.toThrow();
    } finally {
      Date.now = realNow;
    }
  });

  it("hashToken is deterministic and collision-free for distinct inputs", () => {
    const a = tokens.hashToken("token-a");
    const b = tokens.hashToken("token-a");
    const c = tokens.hashToken("token-b");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64); // sha256 hex digest length
  });
});
