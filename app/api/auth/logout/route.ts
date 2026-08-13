import { cookies } from "next/headers";
import {
  deleteAuthSession,
  SESSION_COOKIE_NAME,
  sessionTokenFromRequest,
} from "@/lib/server/auth/session-service";
import { apiHandler } from "@/lib/server/platform/api-handler";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return apiHandler(request, async () => {
    await deleteAuthSession(sessionTokenFromRequest(request));

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });

    return Response.json({ data: { authenticated: false } });
  });
}
