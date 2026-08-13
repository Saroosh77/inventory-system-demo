import { apiHandler } from "@/lib/server/platform/api-handler";
import { requireAdmin } from "../../../../../../lib/server/http";
import { deactivateMasterRecord, updateMasterRecord } from "../../../../../../lib/server/modules/administration";
import { isMasterResource, parseMasterPayload } from "../../../../../../lib/server/validation/master-data";

export async function PATCH(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  return apiHandler(request, async () => {
    const actor = await requireAdmin(request);
    const { resource, id } = await context.params;
    if (!isMasterResource(resource)) return Response.json({ error: "Unknown master-data resource.", code: "UNKNOWN_RESOURCE" }, { status: 404 });
    const payload = parseMasterPayload(resource, await request.json(), true) as Record<string, unknown>;
    return Response.json({ data: await updateMasterRecord(resource, id, payload, actor) });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  return apiHandler(request, async () => {
    const actor = await requireAdmin(request);
    const { resource, id } = await context.params;
    if (!isMasterResource(resource)) return Response.json({ error: "Unknown master-data resource.", code: "UNKNOWN_RESOURCE" }, { status: 404 });
    return Response.json({ data: await deactivateMasterRecord(resource, id, actor) });
  });
}
