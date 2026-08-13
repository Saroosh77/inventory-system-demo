import { z } from "zod";

export const cancelDocumentSchema = z.object({
  reason: z.string().trim().min(5).max(300),
});
