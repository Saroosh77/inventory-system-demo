import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertLoginAllowed,
  clearLoginThrottle,
  recordFailedLogin,
} from "@/lib/server/auth/login-throttle";
import { verifyPassword } from "@/lib/server/auth/password";
import {
  ABSOLUTE_SESSION_SECONDS,
  absoluteCookieExpiry,
  createAuthSession,
  SESSION_COOKIE_NAME,
} from "@/lib/server/auth/session-service";
import { apiHandler } from "@/lib/server/platform/api-handler";
import { DomainError } from "@/lib/server/platform/domain-error";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(72),
});

const DUMMY_PASSWORD_HASH =
  "$2b$12$xYwLolKp3w6c6mSne5a0ROFw/Pao0ZsXLr1qhnSrS9MgO6REh6WQe";

export async function POST(request: Request) {
  return apiHandler(request, async () => {
    const input = loginSchema.parse(await request.json());
    await assertLoginAllowed(input.email, request);

    const user = await prisma.user.findFirst({
      where: {
        email: { equals: input.email, mode: "insensitive" },
        active: true,
      },
      select: { id: true, passwordHash: true },
    });

    const passwordMatches = await verifyPassword(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user?.passwordHash || !passwordMatches) {
      await recordFailedLogin(input.email, request);
      throw new DomainError(
        401,
        "The email or password is incorrect.",
        "INVALID_CREDENTIALS",
      );
    }

    await clearLoginThrottle(input.email, request);
    const session = await createAuthSession(user.id);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: absoluteCookieExpiry(),
      maxAge: ABSOLUTE_SESSION_SECONDS,
    });

    return Response.json({ data: { authenticated: true } });
  });
}
