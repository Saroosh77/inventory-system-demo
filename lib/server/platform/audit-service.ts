import { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/server/access-control";

function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await tx.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: actor.name,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: jsonValue(entry.before),
      after: jsonValue(entry.after),
    },
  });
}
