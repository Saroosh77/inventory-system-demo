/**
 * Historical alias. Document numbering has one implementation in
 * `lib/server/platform/number-service`; this file only keeps the older
 * `nextNumber` name working for the sales, purchasing and recovery services
 * that import it, so a numbering fix can never land in just one of two copies.
 */
export { nextDocumentNumber as nextNumber } from "@/lib/server/platform/number-service";
