"use client";

import { AlertCircle, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useState,
  type SubmitEvent as ReactSubmitEvent,
} from "react";

const COMPANY_NAME =
  process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Demo Foods";

/**
 * Sign-in shortcuts for the three seeded roles.
 *
 * This is a demo build, so the accounts are listed on the sign-in screen and
 * fill the form in one click — swapping roles mid-presentation is the whole
 * point of the demo. Set NEXT_PUBLIC_SHOW_DEMO_LOGINS=false to hide them.
 */
const DEMO_ACCOUNTS = [
  { email: "admin@demo.local", label: "Administrator", detail: "Every module" },
  { email: "finance@demo.local", label: "Finance", detail: "No master data" },
  { email: "warehouse@demo.local", label: "Warehouse", detail: "Stock only, no costs" },
];
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "DemoPass!2026";
const SHOW_DEMO_LOGINS = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS !== "false";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: ReactSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "Unable to sign in.");
      }

      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand" aria-hidden="true">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
        </div>

        <header>
          <p className="eyebrow">Secure operations workspace</p>
          <h1>{COMPANY_NAME}</h1>
          <p>
            Use the account created for your assigned business role.
          </p>
        </header>

        <form onSubmit={submit}>
          <label className="login-field">
            <span>Email address</span>
            <div>
              <Mail size={18} aria-hidden="true" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
                required
                autoFocus
              />
            </div>
          </label>

          <label className="login-field">
            <span>Password</span>
            <div>
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          {error ? (
            <div className="login-error" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            className="login-submit"
            disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {SHOW_DEMO_LOGINS ? (
          <div className="demo-accounts">
            <p>Demonstration accounts — every figure below is fictional</p>
            <div>
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}>
                  <strong>{account.label}</strong>
                  <small>{account.detail}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <footer>
          Access is recorded and limited by your assigned role.
        </footer>
      </section>
    </main>
  );
}
