import { Request, Response } from "express";
import * as controller from "../controllers/backupController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: { backup: { findMany: jest.fn() } },
}));

const db = prisma as unknown as { backup: Record<string, jest.Mock> };

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const request = {} as Request;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("backupController.list", () => {
  it("answers with an empty list rather than an error", async () => {
    db.backup.findMany.mockResolvedValue([]);

    const res = mockResponse();
    await controller.list(request, res);

    expect(res.json).toHaveBeenCalledWith([]);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("converts the BigInt size to a number", async () => {
    db.backup.findMany.mockResolvedValue([
      {
        id: 1,
        filename: "backup-2026-01-01.zip",
        sizeBytes: 4096n,
        includesUploads: true,
        createdBy: 3,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        author: { fullName: "رضا" },
      },
    ]);

    const res = mockResponse();
    await controller.list(request, res);

    // JSON.stringify throws on a BigInt, so this conversion is load-bearing.
    expect(res.json.mock.calls[0][0][0]).toEqual({
      id: 1,
      filename: "backup-2026-01-01.zip",
      size_bytes: 4096,
      includes_uploads: true,
      created_by: 3,
      created_at: "2026-01-01T00:00:00.000Z",
      created_by_name: "رضا",
    });
  });
});

describe("backupController — the disabled endpoints", () => {
  it.each([
    ["create", controller.create],
    ["download", controller.download],
    ["restore", controller.restore],
    ["remove", controller.remove],
  ])("%s refuses with 501", (_name, handler) => {
    const res = mockResponse();
    handler(request, res);

    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json.mock.calls[0][0].error).toContain("در دسترس نیست");
  });
});
