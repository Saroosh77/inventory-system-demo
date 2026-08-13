import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function withSerializableRetry<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === maxAttempts) throw error;
    }
  }

  throw new Error("Serializable transaction retry loop ended unexpectedly.");
}
