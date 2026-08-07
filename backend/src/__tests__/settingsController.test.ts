import { Request, Response } from "express";
import * as controller from "../controllers/settingsController";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    settings: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("fs", () => ({ mkdirSync: jest.fn() }));

const db = prisma as unknown as { settings: Record<string, jest.Mock> };

function decimal(value: number) {
  return { toNumber: () => value };
}

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockRequest(
  valid: Record<string, unknown> = {},
  file?: { filename: string },
) {
  return {
    valid: { body: undefined, params: undefined, query: undefined, ...valid },
    file,
  } as unknown as Request;
}

function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("settingsController.getSettings", () => {
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
});

describe("settingsController.updateSettings", () => {
  it("leaves absent fields untouched", async () => {
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.updateSettings(
      mockRequest({ body: { company_name: "تعمیرگاه رضا" } }),
      mockResponse(),
    );

    expect(db.settings.update).toHaveBeenCalledWith({
      where: { id: 1 },
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
    expect(db.settings.update).not.toHaveBeenCalled();
  });

  it("stores a logo against the company_logo column", async () => {
    db.settings.update.mockResolvedValue(settingsRow());

    const res = mockResponse();
    await controller.uploadImage(
      mockRequest({ params: { type: "logo" } }, { filename: "logo-1.png" }),
      res,
    );

    expect(db.settings.update.mock.calls[0][0].data).toEqual({
      companyLogo: "/uploads/settings/logo-1.png",
    });
    expect(res.json).toHaveBeenCalledWith({
      message: "تصویر با موفقیت آپلود شد",
      path: "/uploads/settings/logo-1.png",
    });
  });

  it("stores a signature against its own column", async () => {
    db.settings.update.mockResolvedValue(settingsRow());

    await controller.uploadImage(
      mockRequest({ params: { type: "signature" } }, { filename: "sig-1.png" }),
      mockResponse(),
    );

    expect(db.settings.update.mock.calls[0][0].data).toEqual({
      signatureImage: "/uploads/settings/sig-1.png",
    });
  });
});
