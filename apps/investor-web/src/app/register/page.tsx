"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthApiError, loginUser, registerUser } from "@/lib/auth-api";
import { useAuthStore } from "@/lib/auth-store";
import { errorTextClass, inputClass, labelClass, primaryButtonClass } from "@/components/auth/authFormStyles";

/**
 * `/register` — email + password + password-confirmation against the real
 * `POST /v1/auth/register`.
 *
 * Register-then-what decision: this pass auto-logs-in by chaining a real
 * `POST /v1/auth/login` call right after a successful register, then
 * redirects to `/` (Discover) — rather than redirecting to `/login` with a
 * "please log in" message. Chosen because `InvestorAuthService.register`
 * sets the new account's status to `active` directly (no email-verification
 * gate in this MVP pass — see that service's doc comment), so an immediate
 * login with the same credentials the user just typed is guaranteed to
 * succeed; making them re-type the same password on a second screen for no
 * reason would just be friction. If that follow-up login call itself fails
 * for some unrelated reason (e.g. hitting the login endpoint's rate limit),
 * the account still exists, so this falls back to sending the user to
 * `/login` to complete it manually rather than showing a scary error for a
 * secondary call.
 */
export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);

    try {
      await registerUser(email, password);
    } catch (err) {
      setError(
        err instanceof AuthApiError ? err.message : "Couldn't reach the server. Check your connection and try again.",
      );
      setSubmitting(false);
      return;
    }

    try {
      const tokens = await loginUser(email, password);
      setSession(tokens);
      router.push("/");
    } catch {
      router.push("/login");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-xl py-2xl">
      <div className="w-full max-w-[380px] rounded border border-border-default bg-surface p-2xl">
        <h1 className="mb-lg text-lg font-semibold text-text-primary">Register</h1>

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
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-xs">
            <label htmlFor="confirmPassword" className={labelClass}>
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className={inputClass}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className={errorTextClass}>
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-lg text-sm text-text-secondary">
          Already have an account?{" "}
          <Link href="/login" className="text-action-primary underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
