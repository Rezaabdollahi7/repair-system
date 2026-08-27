import { randomUUID } from "crypto";
import { Request, Response } from "express";
import multer from "multer";
import { processSettingsImage } from "../lib/imageProfile";
import prisma from "../lib/prisma";
import type { Prisma, Settings } from "../generated/prisma/client";
import {
  deleteObject,
  putObject,
  settingsImageKey,
  signedUrlFor,
} from "../lib/storage";
import { ValidatedRequest } from "../middleware/validate";
import { errorMessage } from "../utils/errors";
import type { SettingsUpdateBody, UploadTypeParam } from "../schemas/settings";
import { workspaceIdOf } from "../utils/workspace";

// memoryStorage now, like device photos: nothing touches disk on the way to
// object storage. These are converted too — they weren't before, but a logo
// and stamp load on every printed invoice, so their size matters more than a
// device photo's does.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("فقط فایل‌های تصویری مجاز هستند"));
    }
    cb(null, true);
  },
});

/**
 * Signs a stored object key, or passes anything else through untouched.
 *
 * Values written before phase 4 are local URL paths, not object keys, and
 * signing one would produce a link to nothing. Recognised by their prefix so
 * an old row renders as a missing image rather than an error.
 */
async function imageUrlOf(key: string | null): Promise<string | null> {
  if (!key || !key.startsWith("workspaces/")) {
    return null;
  }

  return signedUrlFor(key);
}

async function toSettingsResponse(settings: Settings) {
  return {
    id: settings.id,
    company_name: settings.companyName,
    company_address: settings.companyAddress,
    company_phone: settings.companyPhone,
    company_email: settings.companyEmail,
    company_website: settings.companyWebsite,
    // Short-lived signed URLs rather than the stored keys: the bucket is
    // private, so a key on its own is useless to the browser.
    company_logo: await imageUrlOf(settings.companyLogo),
    stamp_image: await imageUrlOf(settings.stampImage),
    signature_image: await imageUrlOf(settings.signatureImage),
    default_tax_rate: settings.defaultTaxRate.toNumber(),
    default_warranty_months: settings.defaultWarrantyMonths,
    invoice_prefix: settings.invoicePrefix,
    invoice_footer_text: settings.invoiceFooterText,
    created_at: settings.createdAt.toISOString(),
    updated_at: settings.updatedAt.toISOString(),
    sale_invoice_paper_size: settings.saleInvoicePaperSize,
    sale_invoice_show_logo: settings.saleInvoiceShowLogo,
    sale_invoice_show_company_info: settings.saleInvoiceShowCompanyInfo,
    sale_invoice_show_email: settings.saleInvoiceShowEmail,
    sale_invoice_show_website: settings.saleInvoiceShowWebsite,
    sale_invoice_show_device_info: settings.saleInvoiceShowDeviceInfo,
    sale_invoice_show_customer_phone: settings.saleInvoiceShowCustomerPhone,
    sale_invoice_show_discount: settings.saleInvoiceShowDiscount,
    sale_invoice_show_tax: settings.saleInvoiceShowTax,
    sale_invoice_show_stamp: settings.saleInvoiceShowStamp,
    sale_invoice_show_signature: settings.saleInvoiceShowSignature,
    sale_invoice_show_warranty: settings.saleInvoiceShowWarranty,
    sale_invoice_show_technician: settings.saleInvoiceShowTechnician,
    sale_invoice_header_text: settings.saleInvoiceHeaderText,
    sale_invoice_footer_text: settings.saleInvoiceFooterText,
  };
}

// GET /api/settings — unauthenticated, so an invoice can render its header.
export const getSettings = async (req: Request, res: Response) => {
  try {
    // Keyed on workspaceId, which is unique on this table — one row per
    // workspace, replacing the single hardcoded row of the single-tenant
    // version.
    const settings = await prisma.settings.findUnique({
      where: { workspaceId: workspaceIdOf(req) },
    });

    if (!settings) {
      // Falls back to the same partial object the old handler returned when
      // the row was missing. The seed creates it, so this is a safety net
      // rather than a normal path.
      return res.json({
        company_name: "تعمیرگاه",
        default_tax_rate: 0,
        default_warranty_months: 3,
        invoice_prefix: "INV-",
        sale_invoice_paper_size: "A5",
        sale_invoice_show_logo: true,
        sale_invoice_show_company_info: true,
        sale_invoice_footer_text: "با تشکر از اعتماد شما",
      });
    }

    res.json(await toSettingsResponse(settings));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PUT /api/settings
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const body = (req as ValidatedRequest).valid.body as SettingsUpdateBody;

    // Built key by key so an absent field keeps its current value — the
    // settings page submits only the section being edited.
    const data: Prisma.SettingsUpdateInput = {};

    if (body.company_name !== undefined) data.companyName = body.company_name;
    if (body.company_address !== undefined) {
      data.companyAddress = body.company_address;
    }
    if (body.company_phone !== undefined) {
      data.companyPhone = body.company_phone;
    }
    if (body.company_email !== undefined) {
      data.companyEmail = body.company_email;
    }
    if (body.company_website !== undefined) {
      data.companyWebsite = body.company_website;
    }
    if (body.default_tax_rate !== undefined) {
      data.defaultTaxRate = body.default_tax_rate;
    }
    if (body.default_warranty_months !== undefined) {
      data.defaultWarrantyMonths = body.default_warranty_months;
    }
    if (body.invoice_prefix !== undefined) {
      data.invoicePrefix = body.invoice_prefix;
    }
    if (body.invoice_footer_text !== undefined) {
      data.invoiceFooterText = body.invoice_footer_text;
    }
    if (body.sale_invoice_paper_size !== undefined) {
      data.saleInvoicePaperSize = body.sale_invoice_paper_size;
    }
    if (body.sale_invoice_show_logo !== undefined) {
      data.saleInvoiceShowLogo = body.sale_invoice_show_logo;
    }
    if (body.sale_invoice_show_company_info !== undefined) {
      data.saleInvoiceShowCompanyInfo = body.sale_invoice_show_company_info;
    }
    if (body.sale_invoice_show_email !== undefined) {
      data.saleInvoiceShowEmail = body.sale_invoice_show_email;
    }
    if (body.sale_invoice_show_website !== undefined) {
      data.saleInvoiceShowWebsite = body.sale_invoice_show_website;
    }
    if (body.sale_invoice_show_device_info !== undefined) {
      data.saleInvoiceShowDeviceInfo = body.sale_invoice_show_device_info;
    }
    if (body.sale_invoice_show_customer_phone !== undefined) {
      data.saleInvoiceShowCustomerPhone = body.sale_invoice_show_customer_phone;
    }
    if (body.sale_invoice_show_discount !== undefined) {
      data.saleInvoiceShowDiscount = body.sale_invoice_show_discount;
    }
    if (body.sale_invoice_show_tax !== undefined) {
      data.saleInvoiceShowTax = body.sale_invoice_show_tax;
    }
    if (body.sale_invoice_show_stamp !== undefined) {
      data.saleInvoiceShowStamp = body.sale_invoice_show_stamp;
    }
    if (body.sale_invoice_show_signature !== undefined) {
      data.saleInvoiceShowSignature = body.sale_invoice_show_signature;
    }
    if (body.sale_invoice_show_warranty !== undefined) {
      data.saleInvoiceShowWarranty = body.sale_invoice_show_warranty;
    }
    if (body.sale_invoice_show_technician !== undefined) {
      data.saleInvoiceShowTechnician = body.sale_invoice_show_technician;
    }
    if (body.sale_invoice_header_text !== undefined) {
      data.saleInvoiceHeaderText = body.sale_invoice_header_text;
    }
    if (body.sale_invoice_footer_text !== undefined) {
      data.saleInvoiceFooterText = body.sale_invoice_footer_text;
    }

    const settings = await prisma.settings.update({
      where: { workspaceId: workspaceIdOf(req) },
      data,
    });

    res.json(await toSettingsResponse(settings));
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

const IMAGE_COLUMNS = {
  logo: "companyLogo",
  stamp: "stampImage",
  signature: "signatureImage",
} as const;

// POST /api/settings/upload/:type
export const uploadImage = async (req: Request, res: Response) => {
  try {
    const { type } = (req as ValidatedRequest).valid.params as UploadTypeParam;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "فایلی آپلود نشده است" });
    }

    const workspaceId = workspaceIdOf(req);
    const column = IMAGE_COLUMNS[type];

    // Read before writing, so the object being replaced can be removed.
    // Without this every logo change leaves its predecessor behind forever.
    const existing = await prisma.settings.findUnique({
      where: { workspaceId },
      select: { [column]: true } as Record<string, boolean>,
    });

    const converted = await processSettingsImage(file.buffer);
    const key = settingsImageKey(workspaceId, `${type}-${randomUUID()}.webp`);
    await putObject(key, converted, "image/webp");

    await prisma.settings.update({
      where: { workspaceId },
      data: { [column]: key },
    });

    const previous = (existing as Record<string, string | null> | null)?.[
      column
    ];
    if (previous && previous.startsWith("workspaces/")) {
      // After the row points at the new object, so a failure here leaves an
      // orphan rather than a settings page with a broken image.
      await deleteObject(previous);
    }

    res.json({
      message: "تصویر با موفقیت آپلود شد",
      path: await signedUrlFor(key),
    });
  } catch (error) {
    console.error("Settings image upload error:", error);
    res.status(500).json({ error: errorMessage(error) });
  }
};
