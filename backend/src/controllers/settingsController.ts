import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import multer from "multer";
import prisma from "../lib/prisma";
import type { Prisma, Settings } from "../generated/prisma/client";
import { ValidatedRequest } from "../middleware/validate";
import { errorMessage } from "../utils/errors";
import type { SettingsUpdateBody, UploadTypeParam } from "../schemas/settings";

export const SETTINGS_UPLOADS_DIR = path.join(__dirname, "../uploads/settings");

fs.mkdirSync(SETTINGS_UPLOADS_DIR, { recursive: true });

// The settings table holds a single row. It becomes one row per workspace in
// phase 2.
const SETTINGS_ID = 1;

// diskStorage rather than memoryStorage: unlike device photos these aren't
// converted, so there's nothing to gain from holding them in memory first.
export const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, SETTINGS_UPLOADS_DIR),
    filename: (req, file, cb) => {
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(
        null,
        `${req.params.type}-${suffix}${path.extname(file.originalname)}`,
      );
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("فقط فایل‌های تصویری مجاز هستند"));
    }
    cb(null, true);
  },
});

function toSettingsResponse(settings: Settings) {
  return {
    id: settings.id,
    company_name: settings.companyName,
    company_address: settings.companyAddress,
    company_phone: settings.companyPhone,
    company_email: settings.companyEmail,
    company_website: settings.companyWebsite,
    company_logo: settings.companyLogo,
    stamp_image: settings.stampImage,
    signature_image: settings.signatureImage,
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
    const settings = await prisma.settings.findUnique({
      where: { id: SETTINGS_ID },
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

    res.json(toSettingsResponse(settings));
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
      where: { id: SETTINGS_ID },
      data,
    });

    res.json(toSettingsResponse(settings));
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

    // Served by the static handler in app.ts, which maps /uploads onto
    // src/uploads. Phase 4 replaces this with an object-storage URL.
    const filePath = `/uploads/settings/${file.filename}`;

    await prisma.settings.update({
      where: { id: SETTINGS_ID },
      data: { [IMAGE_COLUMNS[type]]: filePath },
    });

    res.json({ message: "تصویر با موفقیت آپلود شد", path: filePath });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
