import { createAdjustmentSchema } from "@/lib/server/modules/inventory/inventory-validation";
import { createAdjustment } from "@/lib/server/modules/inventory/stock-service";
import { apiHandler, requireRequestActor } from "@/lib/server/platform/api-handler";

export async function POST(request: Request) {
  return apiHandler(request, async () => {
    const actor = await requireRequestActor(request);
    const input = createAdjustmentSchema.parse(await request.json());
    return Response.json({ data: await createAdjustment(actor, input) }, { status: 201 });
  });
}
