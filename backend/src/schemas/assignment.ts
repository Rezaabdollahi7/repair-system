import { z } from "zod";

export const assignmentParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  personnelId: z.coerce.number().int().positive(),
});

export type AssignmentParams = z.infer<typeof assignmentParamsSchema>;

export const setAssignmentsBodySchema = z.object({
  // Defaults to an empty list rather than rejecting a missing field: the old
  // handler coerced any non-array to [], and an empty list is the legitimate
  // way to clear every assignee.
  personnel_ids: z.array(z.coerce.number().int().positive()).default([]),
});

export type SetAssignmentsBody = z.infer<typeof setAssignmentsBodySchema>;

export const addAssignmentBodySchema = z.object({
  personnel_id: z.coerce
    .number({ message: "personnel_id الزامی است" })
    .int()
    .positive(),
});

export type AddAssignmentBody = z.infer<typeof addAssignmentBodySchema>;
