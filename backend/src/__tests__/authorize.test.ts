import { NextFunction, Request, Response } from "express";
import { atLeast, authorize } from "../middleware/authorize";

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockRequest(user?: { role: string; isActive?: boolean }) {
  return {
    user: user
      ? {
          id: 1,
          workspaceId: 1,
          username: "09123456789",
          role: user.role,
          isActive: user.isActive ?? true,
        }
      : undefined,
  } as Request;
}

function run(
  guard: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
) {
  const res = mockResponse();
  const next = jest.fn() as NextFunction;
  guard(req, res, next);
  return { res, next };
}

describe("shared rejections", () => {
  it.each([
    ["authorize", authorize("admin")],
    ["atLeast", atLeast("admin")],
  ])("%s refuses an unauthenticated request with 401", (_name, guard) => {
    const { res, next } = run(guard, mockRequest());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ["authorize", authorize("admin")],
    ["atLeast", atLeast("admin")],
  ])("%s refuses a disabled account with 403", (_name, guard) => {
    const req = mockRequest({ role: "admin", isActive: false });

    const { res, next } = run(guard, req);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("authorize", () => {
  it("admits exactly the named role", () => {
    const { next } = run(
      authorize("super_admin"),
      mockRequest({ role: "super_admin" }),
    );

    expect(next).toHaveBeenCalled();
  });

  it("refuses a more senior role that wasn't named", () => {
    // The difference from atLeast: authorize("admin") means admins, not
    // "admins and anyone above them".
    const { res, next } = run(
      authorize("admin"),
      mockRequest({ role: "super_admin" }),
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("admits any one of several named roles", () => {
    const { next } = run(
      authorize("admin", "super_admin"),
      mockRequest({ role: "admin" }),
    );

    expect(next).toHaveBeenCalled();
  });

  it("refuses a technician from a super-admin route", () => {
    const { res } = run(
      authorize("super_admin"),
      mockRequest({ role: "technician" }),
    );

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("atLeast", () => {
  it("admits the role itself", () => {
    const { next } = run(atLeast("admin"), mockRequest({ role: "admin" }));

    expect(next).toHaveBeenCalled();
  });

  it("admits a more senior role", () => {
    // So adding a role above admin later doesn't mean revisiting every route
    // that meant "an admin or better".
    const { next } = run(
      atLeast("admin"),
      mockRequest({ role: "super_admin" }),
    );

    expect(next).toHaveBeenCalled();
  });

  it("refuses a more junior role", () => {
    const { res, next } = run(
      atLeast("admin"),
      mockRequest({ role: "technician" }),
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("treats an unrecognised role as having no privileges", () => {
    // role is a string column, so a value outside the three is possible in
    // principle. The safe reading of one is "no privileges", not "unknown
    // rank, let it through".
    const { res } = run(
      atLeast("technician"),
      mockRequest({ role: "something_else" }),
    );

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
