import { apiHandler } from "@/lib/server/platform/api-handler";
import { cancelInvoice } from "../../../../../../lib/server/modules/sales";
import { requireActor } from "../../../../../../lib/server/http";
import { cancelDocumentSchema } from "../../../../../../lib/server/validators";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return apiHandler(request, async () => {
    const actor = await requireActor(request);
    const { id } = await context.params;
    const { reason } = cancelDocumentSchema.parse(await request.json());
    return Response.json({ data: await cancelInvoice(actor, id, reason) });
  });
}
