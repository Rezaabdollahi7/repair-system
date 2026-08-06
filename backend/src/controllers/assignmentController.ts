import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import type { IdParam } from "../schemas/common";
import type {
  AddAssignmentBody,
  AssignmentParams,
  SetAssignmentsBody,
} from "../schemas/assignment";

interface AssigneeRow {
  id: number;
  assignedAt: Date;
  personnel: {
    id: number;
    fullName: string;
    username: string;
  };
}

/**
 * The response shape predates the Prisma migration: `id` is the user's id,
 * not the assignment's, and the assignment id is exposed separately. Mapped
 * by hand rather than through serialize() because of that reshaping.
 */
function toAssigneeResponse(row: AssigneeRow) {
  return {
    assignment_id: row.id,
    assigned_at: row.assignedAt.toISOString(),
    id: row.personnel.id,
    name: row.personnel.fullName,
    username: row.personnel.username,
  };
}

function listAssignees(deviceId: number) {
  return prisma.deviceAssignment.findMany({
    where: { deviceId },
    orderBy: { assignedAt: "asc" },
    select: {
      id: true,
      assignedAt: true,
      personnel: { select: { id: true, fullName: true, username: true } },
    },
  });
}

async function deviceExists(deviceId: number): Promise<boolean> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { id: true },
  });
  return device !== null;
}

// GET /api/devices/:id/assignments
export const getAssignments = async (req: Request, res: Response) => {
  try {
    const { id: deviceId } = (req as ValidatedRequest).valid.params as IdParam;

    if (!(await deviceExists(deviceId))) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    const assignees = await listAssignees(deviceId);
    res.json(assignees.map(toAssigneeResponse));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/devices/:id/assignments
export const setAssignments = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id: deviceId } = valid.params as IdParam;
    const { personnel_ids: personnelIds } = valid.body as SetAssignmentsBody;
    const assignedBy = (req as AuthenticatedRequest).user?.id ?? null;

    if (!(await deviceExists(deviceId))) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    if (personnelIds.length > 0) {
      // One query instead of the old per-id loop, then the difference is
      // reported so the message still names the offending id.
      const active = await prisma.user.findMany({
        where: { id: { in: personnelIds }, isActive: true },
        select: { id: true },
      });
      const activeIds = new Set(active.map((user) => user.id));
      const invalid = personnelIds.find((id) => !activeIds.has(id));

      if (invalid !== undefined) {
        return res
          .status(400)
          .json({ error: `پرسنل با id=${invalid} یافت نشد یا غیرفعال است` });
      }
    }

    // Replace-all in a transaction: without it a failure between the delete
    // and the insert would leave the device with no assignees at all.
    await prisma.$transaction([
      prisma.deviceAssignment.deleteMany({ where: { deviceId } }),
      prisma.deviceAssignment.createMany({
        data: personnelIds.map((personnelId) => ({
          deviceId,
          personnelId,
          assignedBy,
        })),
        skipDuplicates: true,
      }),
    ]);

    const assignees = await listAssignees(deviceId);
    res.json(assignees.map(toAssigneeResponse));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/devices/:id/assignments
export const addAssignment = async (req: Request, res: Response) => {
  try {
    const valid = (req as ValidatedRequest).valid;
    const { id: deviceId } = valid.params as IdParam;
    const { personnel_id: personnelId } = valid.body as AddAssignmentBody;
    const assignedBy = (req as AuthenticatedRequest).user?.id ?? null;

    if (!(await deviceExists(deviceId))) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    const personnel = await prisma.user.findFirst({
      where: { id: personnelId, isActive: true },
      select: { id: true },
    });
    if (!personnel) {
      return res.status(404).json({ error: "پرسنل یافت نشد یا غیرفعال است" });
    }

    // createMany with skipDuplicates stands in for INSERT OR IGNORE: assigning
    // someone twice is a no-op rather than a unique-constraint error.
    await prisma.deviceAssignment.createMany({
      data: [{ deviceId, personnelId, assignedBy }],
      skipDuplicates: true,
    });

    res.status(201).json({ message: "مسئول اضافه شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// DELETE /api/devices/:id/assignments/:personnelId
export const removeAssignment = async (req: Request, res: Response) => {
  try {
    const { id: deviceId, personnelId } = (req as ValidatedRequest).valid
      .params as AssignmentParams;

    const deleted = await prisma.deviceAssignment.deleteMany({
      where: { deviceId, personnelId },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: "اختصاص یافت نشد" });
    }

    res.json({ message: "مسئول حذف شد" });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
