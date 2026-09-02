import { Request, Response } from "express";
import * as controller from "../controllers/assignmentController";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";

jest.mock("../lib/prisma", () => {
  // findFirst rather than findUnique: the controller pairs id with
  // workspaceId now, which findUnique can't express.
  const client = {
    device: { findFirst: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    deviceAssignment: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: client,
    // A named export beside the default, because the controller imports both
    // now. Runs the callback against the same mocks the assertions inspect,
    // so writes made inside the transaction stay visible to them.
    runInWorkspaceTransaction: jest.fn(
      (_workspaceId: number, fn: (tx: unknown) => unknown) => fn(client),
    ),
  };
});

const db = prisma as unknown as {
  device: Record<string, jest.Mock>;
  user: Record<string, jest.Mock>;
  deviceAssignment: Record<string, jest.Mock>;
};

const runInTx = runInWorkspaceTransaction as unknown as jest.Mock;

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Every tenant-scoped handler reads workspaceIdOf(req), which throws when
// the token carried no workspace — so the mock always supplies one, even
// when a test doesn't care which user acted.
const WORKSPACE_ID = 1;

function mockRequest(valid: Record<string, unknown> = {}, userId?: number) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: { id: userId ?? null, workspaceId: WORKSPACE_ID },
  } as unknown as Request;
}

const assignmentRow = {
  id: 5,
  assignedAt: new Date("2026-01-15T10:30:00.000Z"),
  personnel: { id: 2, fullName: "علی", username: "ali" },
};

describe("assignmentController.getAssignments", () => {
  it("returns 404 for an unknown device", async () => {
    db.device.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getAssignments(mockRequest({ params: { id: 1 } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.deviceAssignment.findMany).not.toHaveBeenCalled();
  });

  it("exposes the user id as `id` and the assignment id separately", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceAssignment.findMany.mockResolvedValue([assignmentRow]);

    const res = mockResponse();
    await controller.getAssignments(mockRequest({ params: { id: 1 } }), res);

    expect(res.json).toHaveBeenCalledWith([
      {
        assignment_id: 5,
        assigned_at: "2026-01-15T10:30:00.000Z",
        id: 2,
        name: "علی",
        username: "ali",
      },
    ]);
  });
});

describe("assignmentController.setAssignments", () => {
  it("rejects an inactive or unknown personnel id by name", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.user.findMany.mockResolvedValue([{ id: 2 }]);

    const res = mockResponse();
    await controller.setAssignments(
      mockRequest({ params: { id: 1 }, body: { personnel_ids: [2, 7] } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "پرسنل با id=7 یافت نشد یا غیرفعال است",
    });
    expect(runInTx).not.toHaveBeenCalled();
  });

  it("replaces assignments in a single transaction", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.user.findMany.mockResolvedValue([{ id: 2 }]);
    db.deviceAssignment.findMany.mockResolvedValue([assignmentRow]);

    await controller.setAssignments(
      mockRequest({ params: { id: 1 }, body: { personnel_ids: [2] } }, 9),
      mockResponse(),
    );

    // The workspace is passed explicitly rather than inferred, because the
    // transaction runs on the unextended client and sets its own context.
    expect(runInTx).toHaveBeenCalledWith(WORKSPACE_ID, expect.any(Function));
    expect(db.deviceAssignment.createMany).toHaveBeenCalledWith({
      data: [
        {
          workspaceId: WORKSPACE_ID,
          deviceId: 1,
          personnelId: 2,
          assignedBy: 9,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("clears every assignee when given an empty list", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceAssignment.findMany.mockResolvedValue([]);

    const res = mockResponse();
    await controller.setAssignments(
      mockRequest({ params: { id: 1 }, body: { personnel_ids: [] } }),
      res,
    );

    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.deviceAssignment.deleteMany).toHaveBeenCalledWith({
      where: { deviceId: 1, workspaceId: WORKSPACE_ID },
    });
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("only accepts personnel from the caller's own workspace", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.user.findMany.mockResolvedValue([]);

    const res = mockResponse();
    await controller.setAssignments(
      mockRequest({ params: { id: 1 }, body: { personnel_ids: [2] } }),
      res,
    );

    // A technician from another workspace reads as missing rather than
    // being assignable.
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: WORKSPACE_ID,
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("assignmentController.addAssignment", () => {
  it("returns 404 for an inactive user", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.user.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.addAssignment(
      mockRequest({ params: { id: 1 }, body: { personnel_id: 2 } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.deviceAssignment.createMany).not.toHaveBeenCalled();
  });

  it("treats a duplicate assignment as a no-op", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.user.findFirst.mockResolvedValue({ id: 2 });
    db.deviceAssignment.createMany.mockResolvedValue({ count: 0 });

    const res = mockResponse();
    await controller.addAssignment(
      mockRequest({ params: { id: 1 }, body: { personnel_id: 2 } }, 9),
      res,
    );

    expect(db.deviceAssignment.createMany).toHaveBeenCalledWith({
      data: [
        {
          workspaceId: WORKSPACE_ID,
          deviceId: 1,
          personnelId: 2,
          assignedBy: 9,
        },
      ],
      skipDuplicates: true,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("assignmentController.removeAssignment", () => {
  it("returns 404 when nothing was deleted", async () => {
    db.deviceAssignment.deleteMany.mockResolvedValue({ count: 0 });

    const res = mockResponse();
    await controller.removeAssignment(
      mockRequest({ params: { id: 1, personnelId: 2 } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("confirms removal when a row was deleted", async () => {
    db.deviceAssignment.deleteMany.mockResolvedValue({ count: 1 });

    const res = mockResponse();
    await controller.removeAssignment(
      mockRequest({ params: { id: 1, personnelId: 2 } }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith({ message: "مسئول حذف شد" });
  });
});
