import { Request, Response } from "express";
import { processDeviceImage } from "../lib/imageProfile";
import * as controller from "../controllers/imageController";
import prisma from "../lib/prisma";
import {
  deleteObject,
  deleteObjects,
  putObject,
  signedUrlFor,
} from "../lib/storage";

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

// The profile is mocked rather than sharp underneath it: what this suite
// checks is which keys the controller builds and which bytes go where, not
// how sharp is driven. The numbers themselves are imageProfile's business.
jest.mock("../lib/imageProfile", () => ({
  __esModule: true,
  processDeviceImage: jest.fn(),
}));

// Mocked wholesale rather than mocking the AWS SDK underneath it: what these
// tests care about is which keys the controller builds and when it signs,
// not how the SDK is called.
jest.mock("../lib/storage", () => ({
  __esModule: true,
  putObject: jest.fn(),
  deleteObject: jest.fn(),
  deleteObjects: jest.fn(),
  signedUrlFor: jest.fn(),
  // The real implementation, so a change to the key layout shows up here.
  deviceImageKey: (workspaceId: number, deviceId: number, filename: string) =>
    `workspaces/${workspaceId}/devices/${deviceId}/${filename}`,
  deviceThumbnailKey: (
    workspaceId: number,
    deviceId: number,
    filename: string,
  ) => `workspaces/${workspaceId}/devices/${deviceId}/thumbs/${filename}`,
}));

const db = prisma as unknown as {
  device: Record<string, jest.Mock>;
  deviceImage: Record<string, jest.Mock>;
};

const storage = {
  put: putObject as unknown as jest.Mock,
  deleteOne: deleteObject as unknown as jest.Mock,
  deleteMany: deleteObjects as unknown as jest.Mock,
  sign: signedUrlFor as unknown as jest.Mock,
};

const mockedProcess = processDeviceImage as unknown as jest.Mock;

const CONVERTED = Buffer.from("webp-bytes");
const THUMBNAIL = Buffer.from("thumb-bytes");

function mockProcessSuccess() {
  mockedProcess.mockResolvedValue({ full: CONVERTED, thumbnail: THUMBNAIL });
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

/** Echoes the row back so assertions can read the data that was written. */
function echoCreatedRow() {
  db.deviceImage.create.mockImplementation(
    ({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 10, ...data }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  storage.put.mockResolvedValue(undefined);
  storage.deleteOne.mockResolvedValue(undefined);
  storage.deleteMany.mockResolvedValue(undefined);
  storage.sign.mockResolvedValue("https://signed.example/object?sig=x");
  mockProcessSuccess();
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
    // Nothing is written anywhere: the workspace is what the object key is
    // built from, so an unresolved device must not reach storage at all.
    expect(storage.put).not.toHaveBeenCalled();
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
    echoCreatedRow();
    mockProcessSuccess();

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
    echoCreatedRow();
    mockProcessSuccess();

    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      mockResponse(),
    );

    expect(db.deviceImage.create.mock.calls[0][0].data.sortOrder).toBe(1);
  });

  it("stores the object under the workspace's own prefix", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    echoCreatedRow();
    mockProcessSuccess();

    await controller.uploadImages(
      mockRequest({ params: { id: 7 } }, [fakeFile("a.png")]),
      mockResponse(),
    );

    const { filename, filepath, workspaceId } =
      db.deviceImage.create.mock.calls[0][0].data;

    // Object storage has no row-level security, so the workspace in the key
    // is the only thing keeping one shop's objects out of another's reach.
    expect(filename).toMatch(/\.webp$/);
    expect(filepath).toBe(`workspaces/${WORKSPACE_ID}/devices/7/${filename}`);
    expect(workspaceId).toBe(WORKSPACE_ID);
  });

  it("uploads the converted bytes, not the original", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    echoCreatedRow();
    mockProcessSuccess();

    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      mockResponse(),
    );

    const [key, body, contentType] = storage.put.mock.calls[0];
    expect(key).toContain(`workspaces/${WORKSPACE_ID}/devices/1/`);
    expect(body).toBe(CONVERTED);
    expect(contentType).toBe("image/webp");

    // Second call is the thumbnail, under its own prefix.
    const [thumbKey, thumbBody] = storage.put.mock.calls[1];
    expect(thumbKey).toContain(`workspaces/${WORKSPACE_ID}/devices/1/thumbs/`);
    expect(thumbBody).toBe(THUMBNAIL);
  });

  it("answers with a signed url for each stored image", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    echoCreatedRow();
    mockProcessSuccess();

    const res = mockResponse();
    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      res,
    );

    // The bucket is private, so a bare key would be useless to the browser.
    expect(res.json.mock.calls[0][0].images[0].url).toBe(
      "https://signed.example/object?sig=x",
    );
  });

  it("writes no row when the conversion fails", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mockedProcess.mockRejectedValue(new Error("bad"));

    const res = mockResponse();
    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      res,
    );

    expect(storage.put).not.toHaveBeenCalled();
    expect(db.deviceImage.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("writes no row when the upload fails", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    mockProcessSuccess();
    storage.put.mockRejectedValue(new Error("network"));

    const res = mockResponse();
    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      res,
    );

    // A row pointing at an object that isn't there shows up as a broken
    // image with no way to remove it.
    expect(db.deviceImage.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("keeps the images that did upload when one of them fails", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    echoCreatedRow();
    mockProcessSuccess();
    storage.put
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);

    const res = mockResponse();
    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [
        fakeFile("a.png"),
        fakeFile("b.png"),
      ]),
      res,
    );

    // One bad object shouldn't discard the good one.
    expect(db.deviceImage.create).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
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

  it("signs the key held on the row rather than rebuilding it", async () => {
    db.deviceImage.findMany.mockResolvedValue([
      {
        id: 5,
        filename: "a.webp",
        filepath: "some/legacy/layout/a.webp",
        // Written before 7.0, so it has no thumbnail.
        thumbnailPath: null,
        sortOrder: 1,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const res = mockResponse();
    await controller.getImages(mockRequest({ params: { id: 1 } }), res);

    // Reading the stored key rather than deriving one keeps images findable
    // if the key layout ever changes.
    expect(storage.sign).toHaveBeenCalledWith("some/legacy/layout/a.webp");
    expect(res.json.mock.calls[0][0][0]).toEqual({
      id: 5,
      filename: "a.webp",
      sort_order: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      url: "https://signed.example/object?sig=x",
      thumbnail_url: null,
    });
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
    expect(storage.deleteOne).not.toHaveBeenCalled();
  });

  it("removes the object before the row", async () => {
    db.deviceImage.findFirst.mockResolvedValue({
      id: 5,
      filepath: "workspaces/1/devices/1/a.webp",
      thumbnailPath: "workspaces/1/devices/1/thumbs/a.webp",
    });
    db.deviceImage.delete.mockResolvedValue({ id: 5 });

    const res = mockResponse();
    await controller.deleteImage(
      mockRequest({ params: { id: 1, imageId: 5 } }),
      res,
    );

    // The other order would risk a row pointing at a missing object, which
    // shows as a broken image; this order risks an orphan nobody sees.
    expect(storage.deleteOne).toHaveBeenCalledWith(
      "workspaces/1/devices/1/a.webp",
    );
    // Both objects, or the thumbnails accumulate unreferenced.
    expect(storage.deleteOne).toHaveBeenCalledWith(
      "workspaces/1/devices/1/thumbs/a.webp",
    );
    expect(db.deviceImage.delete).toHaveBeenCalledWith({ where: { id: 5 } });
    expect(res.json).toHaveBeenCalledWith({ message: "عکس حذف شد" });
  });

  it("records the thumbnail key on the row", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    echoCreatedRow();

    await controller.uploadImages(
      mockRequest({ params: { id: 7 } }, [fakeFile("a.png")]),
      mockResponse(),
    );

    const { filename, thumbnailPath } =
      db.deviceImage.create.mock.calls[0][0].data;

    // Stored, not derived at read time — for the same reason filepath is:
    // a computed key stops resolving once the layout changes or a workspace
    // is restored under a new id.
    expect(thumbnailPath).toBe(
      `workspaces/${WORKSPACE_ID}/devices/7/thumbs/${filename}`,
    );
  });

  it("stores the image anyway when only the thumbnail fails", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    echoCreatedRow();
    storage.put
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("network"));

    const res = mockResponse();
    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      res,
    );

    // A missing thumbnail costs bandwidth, not correctness: the frontend
    // falls back to the full image. Losing the photograph over it would be
    // the wrong trade.
    expect(db.deviceImage.create).toHaveBeenCalledTimes(1);
    expect(
      db.deviceImage.create.mock.calls[0][0].data.thumbnailPath,
    ).toBeNull();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("answers with both urls", async () => {
    db.device.findFirst.mockResolvedValue({ id: 1 });
    db.deviceImage.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    echoCreatedRow();

    const res = mockResponse();
    await controller.uploadImages(
      mockRequest({ params: { id: 1 } }, [fakeFile("a.png")]),
      res,
    );

    const image = res.json.mock.calls[0][0].images[0];
    expect(image.url).toBe("https://signed.example/object?sig=x");
    expect(image.thumbnail_url).toBe("https://signed.example/object?sig=x");
  });
});

describe("imageController.deleteDeviceImages", () => {
  it("deletes every object in one call but leaves the rows to the cascade", async () => {
    db.deviceImage.findMany.mockResolvedValue([
      {
        filepath: "workspaces/1/devices/1/a.webp",
        thumbnailPath: "workspaces/1/devices/1/thumbs/a.webp",
      },
      // No thumbnail: a row from before 7.0.
      { filepath: "workspaces/1/devices/1/b.webp", thumbnailPath: null },
    ]);

    await controller.deleteDeviceImages(1, WORKSPACE_ID);

    expect(db.deviceImage.findMany.mock.calls[0][0].where).toEqual({
      deviceId: 1,
      workspaceId: WORKSPACE_ID,
    });
    expect(storage.deleteMany).toHaveBeenCalledWith([
      "workspaces/1/devices/1/a.webp",
      "workspaces/1/devices/1/thumbs/a.webp",
      "workspaces/1/devices/1/b.webp",
    ]);
    expect(db.deviceImage.delete).not.toHaveBeenCalled();
  });
});
