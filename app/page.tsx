import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ErpApp } from "../components/erp/erp-app";
import {
  getActorForSessionToken,
  SESSION_COOKIE_NAME,
} from "../lib/server/auth/session-service";
import { loadSession } from "../lib/server/modules/workspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const actor = await getActorForSessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null,
  );

  if (!actor) redirect("/login");
  return <ErpApp initialSession={await loadSession(actor)} />;
}
