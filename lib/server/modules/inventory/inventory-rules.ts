import { DomainError } from "@/lib/server/platform/domain-error";

export type ProductClassification = {
  productType: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOOD";
  supplyType: "PURCHASED" | "MANUFACTURED";
};

export function validateProductClassification(
  input: ProductClassification,
): void {
  const valid =
    (input.productType === "FINISHED_GOOD" &&
      input.supplyType === "MANUFACTURED") ||
    (input.productType !== "FINISHED_GOOD" &&
      input.supplyType === "PURCHASED");

  if (!valid) {
    throw new DomainError(
      422,
      "Raw materials and packaging must be purchased; finished goods must be manufactured.",
      "INVALID_PRODUCT_CLASSIFICATION",
    );
  }
}
