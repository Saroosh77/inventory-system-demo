import { getItem, updateItem } from "@/lib/server/modules/inventory/item-service";
import { updateItemSchema } from "@/lib/server/modules/inventory/inventory-validation";
import { apiHandler, requireRequestActor } from "@/lib/server/platform/api-handler";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return apiHandler(request, async () => {
    const actor = await requireRequestActor(request);
    const { id } = await context.params;
    return Response.json({ data: await getItem(actor, id) });
  });
}

export async function PATCH(request: Request, context: Context) {
  return apiHandler(request, async () => {
    const actor = await requireRequestActor(request);
    const { id } = await context.params;
    const input = updateItemSchema.parse(await request.json());
    return Response.json({ data: await updateItem(actor, id, input) });
  });
}
