import { z } from "zod";

export const imageParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  imageId: z.coerce.number().int().positive(),
});

export type ImageParams = z.infer<typeof imageParamsSchema>;
