"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthApiError, loginUser } from "@/lib/auth-api";
import { useAuthStore } from "@/lib/auth-store";
import { errorTextClass, inputClass, labelClass, primaryButtonClass } from "@/components/auth/authFormStyles";

/**
 * `/login` — email + password against the real `POST /v1/auth/login`.
 * On success, stores the session in `useAuthStore` and redirects to `/`
 * (Discover). No client-side authorization logic here beyond that
 * redirect — the backend is the only thing that decides whether the
 * credentials are valid.
 */
export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tokens = await loginUser(email, password);
      setSession(tokens);
      router.push("/");
    } catch (err) {
      setError(
        err instanceof AuthApiError ? err.message : "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-xl py-2xl">
      <div className="w-full max-w-[380px] rounded border border-border-default bg-surface p-2xl">
        <h1 className="mb-lg text-lg font-semibold text-text-primary">Log in</h1>

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
              autoComplete="current-password"
              required
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className={errorTextClass}>
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-lg text-sm text-text-secondary">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-action-primary underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
