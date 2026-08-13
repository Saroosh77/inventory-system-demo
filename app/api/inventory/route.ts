import { createTransferSchema } from "@/lib/server/modules/inventory/inventory-validation";
import { createTransfer } from "@/lib/server/modules/inventory/stock-service";
import { apiHandler, requireRequestActor } from "@/lib/server/platform/api-handler";

export async function POST(request: Request) {
  return apiHandler(request, async () => {
    const actor = await requireRequestActor(request);
    const input = createTransferSchema.parse(await request.json());
    return Response.json({ data: await createTransfer(actor, input) }, { status: 201 });
  });
}
