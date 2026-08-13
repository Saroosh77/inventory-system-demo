import { cookies } from "next/headers";
import { z } from "zod";
import { changeOwnPassword } from "@/lib/server/auth/change-password-service";
import {
  MAXIMUM_PASSWORD_LENGTH,
  MINIMUM_PASSWORD_LENGTH,
} from "@/lib/server/auth/password";
import {
  requireRequestActor,
  SESSION_COOKIE_NAME,
} from "@/lib/server/auth/session-service";
import { apiHandler } from "@/lib/server/platform/api-handler";

export const dynamic = "force-dynamic";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(MAXIMUM_PASSWORD_LENGTH),
    newPassword: z
      .string()
      .min(
        MINIMUM_PASSWORD_LENGTH,
        `Password must contain at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
      )
      .max(
        MAXIMUM_PASSWORD_LENGTH,
        `Password must contain at most ${MAXIMUM_PASSWORD_LENGTH} characters.`,
      ),
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "The new password must be different from the current password.",
    path: ["newPassword"],
  });

export async function POST(request: Request) {
  return apiHandler(request, async () => {
    const actor = await requireRequestActor(request);
    const input = changePasswordSchema.parse(await request.json());

    await changeOwnPassword(
      actor,
      input.currentPassword,
      input.newPassword,
    );

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });

    return Response.json({
      data: {
        changed: true,
        message: "Password changed. Please sign in again.",
      },
    });
  });
}

