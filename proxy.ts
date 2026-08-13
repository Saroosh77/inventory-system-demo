import { NextRequest, NextResponse } from "next/server";

/**
 * Per-request CSP with a nonce for Next's own inline hydration scripts
 * (`strict-dynamic` + nonce, not `unsafe-inline`, since this app has none of
 * its own inline <script> usage to accommodate — see next.config.ts for the
 * static headers that don't need a per-request value).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isProd = process.env.NODE_ENV === "production";

  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' is dev-only: React's dev-mode debugging (callstack
    // reconstruction) uses eval(), but "React will never use eval() in
    // production mode" per its own runtime warning — so this only weakens
    // the policy locally, never in a deployed build.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Matches Next.js's own documented CSP+nonce middleware pattern: set the
  // header on the forwarded request too, not just the response. NOTE: a
  // local A/B test (next build && next start, reverting this line) did not
  // reproduce a hydration failure here, so it is defensive/best-practice
  // rather than a confirmed fix for a specific observed symptom.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"],
};
