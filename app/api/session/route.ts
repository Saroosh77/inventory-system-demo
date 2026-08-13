import { loadSession } from "@/lib/server/modules/workspace";
import { requireRequestActor } from "@/lib/server/auth/session-service";
import { apiHandler } from "@/lib/server/platform/api-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiHandler(request, async () => {
    const actor = await requireRequestActor(request);
    return Response.json(await loadSession(actor));
  });
}
