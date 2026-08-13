import type { Actor } from "./access-control";
import { requireRequestActor } from "./auth/session-service";
import { DomainError } from "./platform/domain-error";

export function paginationFrom(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? 50)));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    search: (url.searchParams.get("search") ?? "").trim(),
    includeInactive: url.searchParams.get("includeInactive") === "true",
  };
}

export async function requireActor(request: Request): Promise<Actor> {
  return requireRequestActor(request);
}

export async function requireAdmin(request: Request): Promise<Actor> {
  const actor = await requireActor(request);
  if (actor.role !== "ADMIN") {
    // A typed error, not a "Forbidden:"-prefixed message. The status used to be
    // recovered by string-matching the message, so rewording it would silently
    // turn a 403 into a 422.
    throw new DomainError(403, "Administrator access is required.", "FORBIDDEN");
  }
  return actor;
}
