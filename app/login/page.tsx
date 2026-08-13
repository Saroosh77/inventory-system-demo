import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import {
  getActorForSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/server/auth/session-service";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const actor = await getActorForSessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null,
  );

  if (actor) redirect("/");
  return <LoginForm />;
}
