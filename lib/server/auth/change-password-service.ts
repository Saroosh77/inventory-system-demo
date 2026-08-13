import { prisma } from "@/lib/db";
import type { Actor } from "@/lib/server/access-control";
import { writeAudit } from "@/lib/server/platform/audit-service";
import { DomainError } from "@/lib/server/platform/domain-error";
import { hashPassword, verifyPassword } from "./password";

export async function changeOwnPassword(
  actor: Actor,
  currentPassword: string,
  newPassword: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, active: true, passwordHash: true },
  });

  if (!user?.active || !user.passwordHash) {
    throw new DomainError(
      401,
      "Your account is unavailable. Please sign in again.",
      "AUTHENTICATION_REQUIRED",
    );
  }

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new DomainError(
      400,
      "The current password is incorrect.",
      "INVALID_CURRENT_PASSWORD",
    );
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new DomainError(
      400,
      "The new password must be different from the current password.",
      "PASSWORD_UNCHANGED",
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.id },
      data: { passwordHash },
    });
    await tx.authSession.deleteMany({ where: { userId: actor.id } });
    await writeAudit(tx, actor, {
      action: "PASSWORD_CHANGE",
      entityType: "users",
      entityId: actor.id,
      after: { passwordChanged: true },
    });
  });
}

