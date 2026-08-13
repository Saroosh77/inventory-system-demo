import { apiHandler } from "@/lib/server/platform/api-handler";
import { paginationFrom, requireAdmin } from "../../../../../lib/server/http";
import { createMasterRecord, listMasterData } from "../../../../../lib/server/modules/administration";
import { isMasterResource, parseMasterPayload } from "../../../../../lib/server/validation/master-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  return apiHandler(request, async () => {
    const actor = await requireAdmin(request);
    const { resource } = await context.params;
    if (!isMasterResource(resource)) return Response.json({ error: "Unknown master-data resource.", code: "UNKNOWN_RESOURCE" }, { status: 404 });
    return Response.json(await listMasterData(resource, paginationFrom(request), actor));
  });
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  return apiHandler(request, async () => {
    const actor = await requireAdmin(request);
    const { resource } = await context.params;
    if (!isMasterResource(resource)) return Response.json({ error: "Unknown master-data resource.", code: "UNKNOWN_RESOURCE" }, { status: 404 });
    const payload = parseMasterPayload(resource, await request.json()) as Record<string, unknown>;
    return Response.json({ data: await createMasterRecord(resource, payload, actor) }, { status: 201 });
  });
}
