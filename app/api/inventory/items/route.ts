import { createItem, listItems } from "@/lib/server/modules/inventory/item-service";
import { createItemSchema, itemListQuerySchema } from "@/lib/server/modules/inventory/inventory-validation";
import { apiHandler, queryObject, requireRequestActor } from "@/lib/server/platform/api-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiHandler(request, async () => {
    const actor = await requireRequestActor(request);
    const query = itemListQuerySchema.parse(queryObject(request));
    return Response.json(await listItems(actor, query));
  });
}

//creates item for product catalog
export async function POST(request: Request) {
  return apiHandler(request, async () => {
    const actor = await requireRequestActor(request);
    const input = createItemSchema.parse(await request.json());
    return Response.json({ data: await createItem(actor, input) }, { status: 201 });
  });
}
