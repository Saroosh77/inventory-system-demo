import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date in YYYY-MM-DD format.");
export const optionalId = z.string().min(1).nullable().optional();
export const activeFlag = z.boolean().optional();
