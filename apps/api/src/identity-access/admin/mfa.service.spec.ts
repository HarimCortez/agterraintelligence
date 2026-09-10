import { authenticator } from "otplib";
import { MfaService } from "./mfa.service";

describe("MfaService", () => {
  const service = new MfaService();

  it("generates a base32 candidate secret", () => {
    const secret = service.generateCandidateSecret();
    expect(secret).toEqual(expect.any(String));
    expect(secret.length).toBeGreaterThan(0);
  });

  it("builds an otpauth:// enrollment URI carrying the issuer/label/secret", () => {
    const uri = service.buildEnrollmentUri("admin@example.com", "JBSWY3DPEHPK3PXP");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("admin%40example.com");
    expect(uri).toContain("AgTerra");
  });

  it("verifies a correctly generated TOTP code for the same secret (round-trip against the real otplib algorithm)", async () => {
    const secret = service.generateCandidateSecret();
    const code = authenticator.generate(secret);
    await expect(service.verifyCode(secret, code)).resolves.toBe(true);
  });

  it("rejects an incorrect code", async () => {
    const secret = service.generateCandidateSecret();
    const wrongCode = authenticator.generate(secret) === "000000" ? "111111" : "000000";
    await expect(service.verifyCode(secret, wrongCode)).resolves.toBe(false);
  });

  it("rejects a code generated for a different secret", async () => {
    const secretA = service.generateCandidateSecret();
    const secretB = service.generateCandidateSecret();
    const codeForB = authenticator.generate(secretB);
    await expect(service.verifyCode(secretA, codeForB)).resolves.toBe(false);
  });
});
