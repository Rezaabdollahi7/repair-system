import { Request, Response } from "express";
import fs from "fs";
import sharp from "sharp";
import * as controller from "../controllers/imageController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    // findFirst rather than findUnique: the controller pairs id with
    // workspaceId now, which findUnique can't express.
    device: { findFirst: jest.fn() },
    deviceImage: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("sharp");
jest.mock("fs", () => ({
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
}));

const db = prisma as unknown as {
  device: Record<string, jest.Mock>;
  deviceImage: Record<string, jest.Mock>;
};

const mockedSharp = sharp as unknown as jest.Mock;

function mockSharpSuccess() {
  mockedSharp.mockReturnValue({
    webp: () => ({ toFile: jest.fn().mockResolvedValue(undefined) }),
  });
}

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Every tenant-scoped handler reads workspaceIdOf(req), which throws when
// the token carried no workspace — so the mock has to supply one.
const WORKSPACE_ID = 1;

function mockRequest(valid: Record<string, unknown> = {}, files?: unknown[]) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: { id: 3, workspaceId: WORKSPACE_ID, role: "super_admin" },
    files,
  } as unknown as Request;
}

function fakeFile(originalname: string) {
  return { buffer: Buffer.from("x"), originalname, mimetype: "image/png" };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("imageController.uploadImages", () => {
  it("returns 404 for an unknown device", async () => {
    db.device.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.deviceImage.create).not.toHaveBeenCalled();
  });

  it("returns 400 when no file was sent", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });

    const res = mockResponse();
    await controller.uploadImages(mockRequest({ params: { id: 1 } }, []), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("continues numbering sort_order from the highest existing value", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
    db.deviceImage.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 10, ...data }),
    );
    mockSharpSuccess();

    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [
        fakeFile("a.png"),
        fakeFile("b.png"),
      ]),
      mockResponse(),
    );

    const orders = db.deviceImage.create.mock.calls.map(
      ([args]) => args.data.sortOrder,
    );
    expect(orders).toEqual([5, 6]);
  });

  it("starts at 1 when the device has no images yet", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    db.deviceImage.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 10, ...data }),
    );
    mockSharpSuccess();

    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      mockResponse(),
    );

    expect(db.deviceImage.create.mock.calls[0][0].data.sortOrder).toBe(1);
  });

  it("stores a path relative to the uploads root", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    db.deviceImage.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 10, ...data }),
    );
    mockSharpSuccess();

    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      mockResponse(),
    );

    const { filename, filepath, workspaceId } =
      db.deviceImage.create.mock.calls[0][0].data;
    expect(filename).toMatch(/\.webp$/);
    expect(filepath).toBe(`devices/${filename}`);
    expect(workspaceId).toBe(WORKSPACE_ID);
  });

  it("writes no row when the conversion fails", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mockedSharp.mockReturnValue({
      webp: () => ({ toFile: jest.fn().mockRejectedValue(new Error("bad")) }),
    });

    const res = mockResponse();
    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      res,
    );

    expect(db.deviceImage.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("imageController.deleteImage", () => {
  it("returns 404 for an image belonging to another device", async () => {
    db.deviceImage.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await controller.deleteImage(
      mockRequest({ params: { id: 1, imageId: 5 } }),
      res,
    );

    expect(db.deviceImage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5, deviceId: 1, workspaceId: WORKSPACE_ID },
      }),
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("removes the row even when the file can't be deleted", async () => {
    db.deviceImage.findFirst.mockResolvedValue({ id: 5, filename: "a.webp" });
    (fs.rmSync as jest.Mock).mockImplementation(() => {
      throw new Error("EACCES");
    });
    db.deviceImage.delete.mockResolvedValue({ id: 5 });

    const res = mockResponse();
    await controller.deleteImage(
      mockRequest({ params: { id: 1, imageId: 5 } }),
      res,
    );

    expect(db.deviceImage.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(res.json).toHaveBeenCalledWith({ message: "عکس حذف شد" });
  });
});

describe("imageController.deleteDeviceImages", () => {
  it("deletes every file but leaves the rows to the cascade", async () => {
    db.deviceImage.findMany.mockResolvedValue([
      { filename: "a.webp" },
      { filename: "b.webp" },
    ]);
    (fs.rmSync as jest.Mock).mockImplementation(() => undefined);

    await controller.deleteDeviceImages(1, WORKSPACE_ID);

    expect(db.deviceImage.findMany.mock.calls[0][0].where).toEqual({
      deviceId: 1,
      workspaceId: WORKSPACE_ID,
    });
    expect(fs.rmSync).toHaveBeenCalledTimes(2);
    expect(db.deviceImage.delete).not.toHaveBeenCalled();
  });
});

describe("imageController.getImages", () => {
  it("scopes the listing to the caller's workspace", async () => {
    db.deviceImage.findMany.mockResolvedValue([]);

    await controller.getImages(
      mockRequest({ params: { id: 1 } }),
      mockResponse(),
    );

    expect(db.deviceImage.findMany.mock.calls[0][0].where).toEqual({
      deviceId: 1,
      workspaceId: WORKSPACE_ID,
    });
  });
});
