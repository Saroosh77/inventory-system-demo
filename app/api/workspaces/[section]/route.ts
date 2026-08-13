import { apiHandler } from "@/lib/server/platform/api-handler";
import { parseDateOnly } from "@/lib/server/platform/date";
import { requireActor } from "../../../../lib/server/http";
import { loadWorkspace, type WorkspaceSection } from "../../../../lib/server/modules/workspace";

export const dynamic = "force-dynamic";

const sections = new Set<WorkspaceSection>(["dashboard", "inventory", "invoices", "reports"]);

export async function GET(request: Request, context: { params: Promise<{ section: string }> }) {
  return apiHandler(request, async () => {
    const { section } = await context.params;
    if (!sections.has(section as WorkspaceSection)) return Response.json({ error: "Unknown workspace module.", code: "UNKNOWN_WORKSPACE_MODULE" }, { status: 404 });
    const actor = await requireActor(request);
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    const dateRange = dateFrom || dateTo
      ? { from: dateFrom ? parseDateOnly(dateFrom) : null, to: dateTo ? parseDateOnly(dateTo) : null }
      : undefined;
    return Response.json(
      await loadWorkspace(section as WorkspaceSection, actor, dateRange),
    );
  });
}
