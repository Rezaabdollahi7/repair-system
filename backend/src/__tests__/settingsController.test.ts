import { Request, Response } from "express";
import { processSettingsImage } from "../lib/imageProfile";
import * as controller from "../controllers/settingsController";
import prisma from "../lib/prisma";
import { deleteObject, putObject, signedUrlFor } from "../lib/storage";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    settings: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("../lib/imageProfile", () => ({
  __esModule: true,
  processSettingsImage: jest.fn(),
}));

jest.mock("../lib/storage", () => ({
  __esModule: true,
  putObject: jest.fn(),
  deleteObject: jest.fn(),
  signedUrlFor: jest.fn(),
  // The real implementation, so a change to the key layout shows up here.
  settingsImageKey: (workspaceId: number, filename: string) =>
    `workspaces/${workspaceId}/settings/${filename}`,
}));

const db = prisma as unknown as { settings: Record<string, jest.Mock> };

const storage = {
  put: putObject as unknown as jest.Mock,
  deleteOne: deleteObject as unknown as jest.Mock,
  sign: signedUrlFor as unknown as jest.Mock,
};

const CONVERTED = Buffer.from("webp-bytes");
const SIGNED = "https://signed.example/object?sig=x";
function decimal(value: number) {
  return { toNumber: () => value };
}

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Settings are one row per workspace now, keyed on workspaceId rather than
// the hardcoded id 1 the single-tenant version used.
const WORKSPACE_ID = 1;

function mockRequest(
  valid: Record<string, unknown> = {},
  file?: { buffer: Buffer },
) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    user: { id: 3, workspaceId: WORKSPACE_ID, role: "super_admin" },
    file,
  } as unknown as Request;
}

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspaceId: WORKSPACE_ID,
    companyName: "تعمیرگاه",
    companyAddress: null,
    companyPhone: null,
    companyEmail: null,
    companyWebsite: null,
    companyLogo: null,
    stampImage: null,
    signatureImage: null,
    defaultTaxRate: decimal(9),
    defaultWarrantyMonths: 3,
    invoicePrefix: "INV-",
    invoiceFooterText: null,
    saleInvoicePaperSize: "A5",
    saleInvoiceShowLogo: true,
    saleInvoiceShowCompanyInfo: true,
    saleInvoiceShowEmail: false,
    saleInvoiceShowWebsite: false,
    saleInvoiceShowDeviceInfo: false,
    saleInvoiceShowCustomerPhone: false,
    saleInvoiceShowDiscount: false,
    saleInvoiceShowTax: false,
    saleInvoiceShowStamp: false,
    saleInvoiceShowSignature: false,
    saleInvoiceShowWarranty: false,
    saleInvoiceShowTechnician: false,
    saleInvoiceHeaderText: null,
    saleInvoiceFooterText: "با تشکر از اعتماد شما",
    createdAt: new Date("2026-08-06T00:00:00.000Z"),
    updatedAt: new Date("2026-08-06T00:00:00.000Z"),
    ...overrides,
  };
}

/** Stands in for an uploaded file: multer holds it in memory now. */
const uploadedFile = { buffer: Buffer.from("original") };

beforeEach(() => {
  jest.clearAllMocks();
  storage.put.mockResolvedValue(undefined);
  storage.deleteOne.mockResolvedValue(undefined);
  storage.sign.mockResolvedValue(SIGNED);
  (processSettingsImage as unknown as jest.Mock).mockResolvedValue(CONVERTED);
  // uploadImage reads the row before writing, to remove the object it
  // replaces.
  db.settings.findUnique.mockResolvedValue({});
});

describe("settingsController.getSettings", () => {
  it("reads the row belonging to the caller's workspace", async () => {
    db.settings.findUnique.mockResolvedValue(settingsRow());

    await controller.getSettings(mockRequest(), mockResponse());

    expect(db.settings.findUnique).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID },
    });
  });

  it("returns the display flags as real booleans", async () => {
    db.settings.findUnique.mockResolvedValue(settingsRow());

    const res = mockResponse();
    await controller.getSettings(mockRequest(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.sale_invoice_show_logo).toBe(true);
    expect(payload.sale_invoice_show_email).toBe(false);
  });

  it("converts the tax rate from Decimal to a number", async () => {
    db.settings.findUnique.mockResolvedValue(settingsRow());

    const res = mockResponse();
    await controller.getSettings(mockRequest(), res);

    expect(res.json.mock.calls[0][0].default_tax_rate).toBe(9);
  });

  it("falls back to defaults when the row is missing", async () => {
    db.settings.findUnique.mockResolvedValue(null);

    const res = mockResponse();
    await controller.getSettings(mockRequest(), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        company_name: "تعمیرگاه",
        invoice_prefix: "INV-",
        sale_invoice_show_logo: true,
      }),
    );
  });

  it("signs a stored image key but not an old disk path", async () => {
    db.settings.findUnique.mockResolvedValue(
      settingsRow({
        companyLogo: "workspaces/1/settings/logo.webp",
        stampImage: "/uploads/settings/stamp-1.png",
      }),
    );

    const res = mockResponse();
    await controller.getSettings(mockRequest(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.company_logo).toBe(SIGNED);
    // Signing an old path would produce a link to nothing, so it reads as a
    // missing image instead.
    expect(payload.stamp_image).toBeNull();
  });
});

describe("settingsController.updateSettings", () => {
  it("updates the caller's own row, not a hardcoded one", async () => {
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.updateSettings(
      mockRequest({ body: { company_name: "تعمیرگاه رضا" } }),
      mockResponse(),
    );

    expect(db.settings.update).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID },
      data: { companyName: "تعمیرگاه رضا" },
    });
  });

  it("maps snake_case request keys onto camelCase columns", async () => {
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.updateSettings(
      mockRequest({
        body: {
          sale_invoice_show_stamp: true,
          default_warranty_months: 6,
        },
      }),
      mockResponse(),
    );

    expect(db.settings.update.mock.calls[0][0].data).toEqual({
      saleInvoiceShowStamp: true,
      defaultWarrantyMonths: 6,
    });
  });

  it("writes false rather than skipping it", async () => {
    // A truthiness check here would drop every flag being switched off.
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.updateSettings(
      mockRequest({ body: { sale_invoice_show_logo: false } }),
      mockResponse(),
    );

    expect(db.settings.update.mock.calls[0][0].data).toEqual({
      saleInvoiceShowLogo: false,
    });
  });

  it("writes a zero tax rate rather than skipping it", async () => {
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.updateSettings(
      mockRequest({ body: { default_tax_rate: 0 } }),
      mockResponse(),
    );

    expect(db.settings.update.mock.calls[0][0].data).toEqual({
      defaultTaxRate: 0,
    });
  });
});

describe("settingsController.uploadImage", () => {
  it("returns 400 when no file was sent", async () => {
    const res = mockResponse();
    await controller.uploadImage(
      mockRequest({ params: { type: "logo" } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(storage.put).not.toHaveBeenCalled();
    expect(db.settings.update).not.toHaveBeenCalled();
  });

  it("stores the object under the workspace's own prefix", async () => {
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.uploadImage(
      mockRequest({ params: { type: "logo" } }, uploadedFile),
      mockResponse(),
    );

    // Object storage has no row-level security, so the workspace in the key
    // is the only thing keeping one shop's objects out of another's reach.
    const [key, body, contentType] = storage.put.mock.calls[0];
    expect(key).toMatch(
      new RegExp(`^workspaces/${WORKSPACE_ID}/settings/logo-.+\\.webp$`),
    );
    expect(body).toBe(CONVERTED);
    expect(contentType).toBe("image/webp");
  });

  it("records the key against the column the type names", async () => {
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.uploadImage(
      mockRequest({ params: { type: "signature" } }, uploadedFile),
      mockResponse(),
    );

    const { data, where } = db.settings.update.mock.calls[0][0];
    expect(where).toEqual({ workspaceId: WORKSPACE_ID });
    expect(data.signatureImage).toBe(storage.put.mock.calls[0][0]);
  });

  it("answers with a signed url, not the stored key", async () => {
    db.settings.update.mockResolvedValue(settingsRow());

    const res = mockResponse();
    await controller.uploadImage(
      mockRequest({ params: { type: "logo" } }, uploadedFile),
      res,
    );

    // The bucket is private: a key on its own is useless to the browser.
    expect(res.json).toHaveBeenCalledWith({
      message: "تصویر با موفقیت آپلود شد",
      path: SIGNED,
    });
  });

  it("removes the object it replaced", async () => {
    db.settings.findUnique.mockResolvedValue({
      companyLogo: "workspaces/1/settings/logo-old.webp",
    });
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.uploadImage(
      mockRequest({ params: { type: "logo" } }, uploadedFile),
      mockResponse(),
    );

    // Without this every logo change leaves its predecessor behind forever.
    expect(storage.deleteOne).toHaveBeenCalledWith(
      "workspaces/1/settings/logo-old.webp",
    );
  });

  it("leaves a pre-phase-4 disk path alone rather than trying to delete it", async () => {
    db.settings.findUnique.mockResolvedValue({
      companyLogo: "/uploads/settings/logo-1.png",
    });
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.uploadImage(
      mockRequest({ params: { type: "logo" } }, uploadedFile),
      mockResponse(),
    );

    // Values written before phase 4 are local URL paths, not object keys.
    expect(storage.deleteOne).not.toHaveBeenCalled();
  });
});
