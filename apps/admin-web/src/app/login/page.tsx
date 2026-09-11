"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AdminAuthApiError, loginAdmin } from "@/lib/admin-auth-api";
import { useAdminAuthStore } from "@/lib/admin-auth-store";
import { errorTextClass, inputClass, labelClass, primaryButtonClass } from "@/components/auth/adminAuthFormStyles";

/**
 * `/login` — email + password against the real `POST /v1/admin/auth/login`.
 * No self-registration link (unlike investor-web's login page) — admin
 * accounts are provisioned out-of-band, by design (see
 * `AdminAuthController`'s doc comment).
 *
 * Two-step flow for MFA-enrolled accounts: a first submit with just
 * email/password gets a 401 with `error: "mfa_required"` (not a real
 * failure), which swaps the form to a TOTP-code prompt and resubmits with
 * the same credentials plus the code — rather than always showing a code
 * field up front, since most accounts today aren't MFA-enrolled yet (no
 * enrollment UI exists in this console yet either).
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const setSession = useAdminAuthStore((state) => state.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tokens = await loginAdmin(email, password, mfaRequired ? totpCode : undefined);
      setSession(tokens);
      router.push("/");
    } catch (err) {
      if (err instanceof AdminAuthApiError && err.code === "mfa_required") {
        setMfaRequired(true);
        setError(mfaRequired ? err.message : null); // only surface as an error once a code has actually been tried
      } else {
        setError(
          err instanceof AdminAuthApiError
            ? err.message
            : "Couldn't reach the server. Check your connection and try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-xl py-2xl">
      <div className="w-full max-w-[380px] rounded border border-border-default bg-surface p-2xl">
        <h1 className="mb-lg text-lg font-semibold text-text-primary">Admin log in</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-lg" noValidate>
          <div className="flex flex-col gap-xs">
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              disabled={mfaRequired}
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label htmlFor="password" className={labelClass}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={mfaRequired}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {mfaRequired && (
            <div className="flex flex-col gap-xs">
              <label htmlFor="totpCode" className={labelClass}>
                Authenticator code
              </label>
              <input
                id="totpCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                className={inputClass}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
            </div>
          )}

          {error && (
            <p role="alert" className={errorTextClass}>
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Logging in…" : mfaRequired ? "Verify code" : "Log in"}
          </button>
        </form>
      </div>
    </div>
  );
}
