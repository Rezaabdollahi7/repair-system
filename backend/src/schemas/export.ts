import { z } from "zod";

export const exportCreateSchema = z.object({
  // Optional and defaulting to false: most exports are asked for to read the
  // numbers, and a shop with a thousand photos should not download them by
  // accident.
  include_images: z.boolean().default(false),
});

export type ExportCreateBody = z.infer<typeof exportCreateSchema>;
