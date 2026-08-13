import { Prisma } from "@prisma/client";

/**
 * Allocates the next document number for a year.
 *
 * The counter key carries the year (`invoice:2026`) so each year is its own
 * contiguous series. A single global counter would leave every per-year
 * sequence full of gaps — the numbers a document series is audited on — and
 * backdating a document would drop it at an arbitrary point in a prior year.
 *
 * The year comes from the document's own business date, not the wall clock, so
 * the number always agrees with the date printed on the document.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  key: string,
  prefix: string,
  date: Date,
) {
  const year = date.getUTCFullYear();
  const counter = await tx.counter.upsert({
    where: { key: `${key}:${year}` },
    create: { key: `${key}:${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });

  return `${prefix}-${year}-${String(counter.value).padStart(5, "0")}`;
}
