import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/server/platform/domain-error";

const WINDOW_MILLISECONDS = 15 * 60 * 1000;
const MAXIMUM_FAILURES = 5;

function throttleKey(email: string, request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const address = forwardedFor?.split(",")[0]?.trim() || "local";
  return createHash("sha256")
    .update(`${email.toLowerCase()}|${address}`)
    .digest("hex");
}

export async function assertLoginAllowed(email: string, request: Request) {
  const row = await prisma.loginThrottle.findUnique({
    where: { key: throttleKey(email, request) },
  });

  if (row?.blockedUntil && row.blockedUntil > new Date()) {
    throw new DomainError(
      429,
      "Too many sign-in attempts. Wait 15 minutes and try again.",
      "LOGIN_RATE_LIMITED",
    );
  }
}

export async function recordFailedLogin(email: string, request: Request) {
  const key = throttleKey(email, request);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const current = await tx.loginThrottle.findUnique({ where: { key } });
    const windowExpired =
      !current ||
      current.windowStartedAt.getTime() + WINDOW_MILLISECONDS <= now.getTime();
    const failedAttempts = windowExpired
      ? 1
      : current.failedAttempts + 1;

    await tx.loginThrottle.upsert({
      where: { key },
      create: {
        key,
        failedAttempts,
        windowStartedAt: now,
        blockedUntil:
          failedAttempts >= MAXIMUM_FAILURES
            ? new Date(now.getTime() + WINDOW_MILLISECONDS)
            : null,
      },
      update: {
        failedAttempts,
        windowStartedAt: windowExpired
          ? now
          : current?.windowStartedAt ?? now,
        blockedUntil:
          failedAttempts >= MAXIMUM_FAILURES
            ? new Date(now.getTime() + WINDOW_MILLISECONDS)
            : null,
      },
    });
  });
}

export async function clearLoginThrottle(email: string, request: Request) {
  await prisma.loginThrottle.deleteMany({
    where: { key: throttleKey(email, request) },
  });
}
