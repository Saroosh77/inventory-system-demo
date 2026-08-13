import { batchQuerySchema } from "@/lib/server/modules/inventory/inventory-validation";
import { listBatches } from "@/lib/server/modules/inventory/stock-service";
import { apiHandler, queryObject, requireRequestActor } from "@/lib/server/platform/api-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiHandler(request, async () => {
    const actor = await requireRequestActor(request);
    const query = batchQuerySchema.parse(queryObject(request));
    return Response.json(await listBatches(actor, query));
  });
}
