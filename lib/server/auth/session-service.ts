import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/server/access-control";
import { DomainError } from "@/lib/server/platform/domain-error";

export const SESSION_COOKIE_NAME = "erp_demo_session";
// Short, sliding idle timeout — this is the real security-relevant TTL,
// stored as AuthSession.expiresAt and refreshed on every successful use.
export const IDLE_TIMEOUT_SECONDS = 60 * 15;
// Hard ceiling from AuthSession.createdAt, independent of activity — bounds
// how long a continuously-used session can live even if never idle.
export const ABSOLUTE_SESSION_SECONDS = 60 * 60 * 12;
// Only persist the slid-forward expiry when the extension is meaningful, to
// avoid a DB write on every single request from a continuously-active user.
const REFRESH_WRITE_THRESHOLD_SECONDS = 60 * 5;

const actorSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  staffId: true,
  warehouseId: true,
} as const;

export function sessionTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionTokenFromCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;

    const name = cookie.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) continue;

    const value = cookie.slice(separator + 1).trim();
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

export function sessionTokenFromRequest(request: Request) {
  return sessionTokenFromCookieHeader(request.headers.get("cookie"));
}

/**
 * The cookie's own browser-side lifetime is deliberately decoupled from the
 * DB-side sliding expiry: it's set once, at login, to the full absolute
 * ceiling, and never reissued. The server re-derives validity from
 * AuthSession on every request regardless, so an idle cookie past
 * IDLE_TIMEOUT_SECONDS is already inert (the row is gone or expired) well
 * before the cookie itself would stop being sent.
 */
export function absoluteCookieExpiry(from: Date = new Date()) {
  return new Date(from.getTime() + ABSOLUTE_SESSION_SECONDS * 1000);
}

/**
 * Pure arithmetic, no I/O — kept separate from getActorForSessionToken so it
 * can be unit tested without a database. nextExpiresAt is always >=
 * currentExpiresAt for increasing `now`, since currentExpiresAt was itself
 * always previously computed the same way.
 */
export function computeSlidingExpiry(params: {
  now: Date;
  createdAt: Date;
  currentExpiresAt: Date;
}): { nextExpiresAt: Date; shouldPersist: boolean } {
  const { now, createdAt, currentExpiresAt } = params;
  const absoluteExpiry = new Date(
    createdAt.getTime() + ABSOLUTE_SESSION_SECONDS * 1000,
  );
  const nextExpiresAt = new Date(
    Math.min(now.getTime() + IDLE_TIMEOUT_SECONDS * 1000, absoluteExpiry.getTime()),
  );
  const shouldPersist =
    nextExpiresAt.getTime() - currentExpiresAt.getTime() >=
    REFRESH_WRITE_THRESHOLD_SECONDS * 1000;
  return { nextExpiresAt, shouldPersist };
}

export async function createAuthSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  // Defensively capped at the absolute ceiling too, in case IDLE_TIMEOUT_SECONDS
  // is ever misconfigured larger than ABSOLUTE_SESSION_SECONDS.
  const expiresAt = new Date(
    Math.min(now + IDLE_TIMEOUT_SECONDS * 1000, now + ABSOLUTE_SESSION_SECONDS * 1000),
  );

  await prisma.$transaction([
    prisma.authSession.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    }),
    prisma.authSession.create({
      data: {
        userId,
        tokenHash: sessionTokenHash(token),
        expiresAt,
      },
    }),
  ]);

  return { token, expiresAt };
}

export async function deleteAuthSession(token: string | null) {
  if (!token) return;
  await prisma.authSession.deleteMany({
    where: { tokenHash: sessionTokenHash(token) },
  });
}

export async function getActorForSessionToken(
  token: string | null,
): Promise<Actor | null> {
  if (!token) return null;

  const tokenHash = sessionTokenHash(token);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    select: {
      expiresAt: true,
      createdAt: true,
      user: { select: { ...actorSelect, active: true } },
    },
  });

  if (!session) return null;

  const now = new Date();
  const absoluteExpiry = new Date(
    session.createdAt.getTime() + ABSOLUTE_SESSION_SECONDS * 1000,
  );
  if (!session.user.active || session.expiresAt <= now || now >= absoluteExpiry) {
    await deleteAuthSession(token);
    return null;
  }

  const { nextExpiresAt, shouldPersist } = computeSlidingExpiry({
    now,
    createdAt: session.createdAt,
    currentExpiresAt: session.expiresAt,
  });
  if (shouldPersist) {
    // updateMany, not update: the row can legitimately vanish between the
    // read above and this write (change-password kills every session for a
    // user, logout deletes by this same tokenHash) — update() would throw
    // P2025 on that race, surfacing as an uncaught rejection in the
    // Server Components (app/page.tsx, app/login/page.tsx) that call this
    // function directly outside apiHandler's error boundary.
    await prisma.authSession.updateMany({
      where: { tokenHash },
      data: { expiresAt: nextExpiresAt },
    });
  }

  const { active: _active, ...actor } = session.user;
  void _active;
  return actor;
}

export async function getRequestActor(request: Request) {
  return getActorForSessionToken(sessionTokenFromRequest(request));
}

export async function requireRequestActor(request: Request): Promise<Actor> {
  const actor = await getRequestActor(request);
  if (!actor) {
    throw new DomainError(
      401,
      "Your session is missing or has expired. Please sign in again.",
      "AUTHENTICATION_REQUIRED",
    );
  }
  return actor;
}
