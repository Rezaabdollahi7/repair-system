import { Request, Response } from "express";
import prisma from "../lib/prisma";
import { ZibalError } from "../lib/zibal";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { currentUnitPriceRials } from "../utils/smsPricing";
import { PARAM_CAPS } from "../utils/smsTemplates";
import {
  GENERIC_GATEWAY_FAILURE,
  settleTopup,
  startTopup,
} from "../utils/smsTopup";
import { workspaceIdOf } from "../utils/workspace";
import type {
  SmsListQuery,
  SmsSettingsBody,
  TopupBody,
  WalletVerifyBody,
} from "../schemas/sms";

/**
 * Rials everywhere, as in every other response this API sends. The frontend
 * divides by ten for display; nothing here holds tomans.
 */

/**
 * A representative message, for the "how many can I still send" figure.
 *
 * Every approved template is two parts at the caps, so the estimate is the
 * balance divided by two parts' worth. Derived rather than hardcoded, so a
 * shorter template added later changes this number by itself.
 */
const PARTS_PER_MESSAGE = 2;

// GET /api/sms/wallet
export const wallet = async (req: Request, res: Response) => {
  try {
    const workspaceId = workspaceIdOf(req);

    const row = await prisma.smsWallet.findUnique({
      where: { workspaceId },
      select: { balanceRials: true },
    });

    // Every workspace gets a wallet from populateWorkspace and the 12.1
    // migration backfilled the rest, so a missing row is a broken sign-up
    // rather than an empty wallet. Reported as zero here rather than thrown:
    // this is a screen, and a shop should see a balance and a top-up button
    // instead of an error page.
    const balanceRials = row?.balanceRials.toNumber() ?? 0;
    const unitPriceRials = await currentUnitPriceRials();
    const messagePriceRials = unitPriceRials * PARTS_PER_MESSAGE;

    res.json({
      balance_rials: balanceRials,
      unit_price_rials: unitPriceRials,
      message_price_rials: messagePriceRials,
      // Approximate on purpose, and the word is in the field name: a
      // one-part message would cost half this, so the figure is a floor.
      approximate_messages_left: Math.floor(balanceRials / messagePriceRials),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/sms/wallet/topup
export const topup = async (req: Request, res: Response) => {
  try {
    const { amount_rials } = (req as ValidatedRequest).valid.body as TopupBody;
    const actor = (req as AuthenticatedRequest).user;

    const started = await startTopup(workspaceIdOf(req), {
      amountRials: amount_rials,
      actorId: actor?.id ?? null,
      // Lets the gateway offer the customer their saved cards. The username
      // is a phone number, which is what Zibal wants.
      mobile: actor?.username,
    });

    // ⚠️ The client must navigate to redirect_url, not fetch it. Zibal
    // requires a Referer matching the registered domain on /start/{trackId},
    // and only a real navigation from app.dofixo.ir carries one.
    res.json({
      topup_id: started.topupId,
      amount_rials: started.amountRials,
      redirect_url: started.redirectUrl,
    });
  } catch (error) {
    // Zibal's own errors never reach the workshop: they are result codes and
    // gateway messages, useful to an operator reading the log and to nobody
    // else.
    if (error instanceof ZibalError) {
      console.error("sms wallet topup failed:", errorMessage(error));
      return res.status(502).json({ error: GENERIC_GATEWAY_FAILURE });
    }

    res.status(500).json({ error: errorMessage(error) });
  }
};

// POST /api/sms/wallet/verify
export const verify = async (req: Request, res: Response) => {
  try {
    const { track_id } = (req as ValidatedRequest).valid
      .body as WalletVerifyBody;

    const settled = await settleTopup(workspaceIdOf(req), track_id);

    // `credited` is false both when this call did nothing and when an
    // earlier one already did. The page shows the balance either way, so the
    // difference does not need to reach the customer.
    res.json({
      credited: settled.credited,
      balance_rials: settled.balanceAfterRials,
    });
  } catch (error) {
    console.error("sms wallet verify failed:", errorMessage(error));
    res.status(500).json({ error: GENERIC_GATEWAY_FAILURE });
  }
};

// GET /api/sms/wallet/transactions
export const transactions = async (req: Request, res: Response) => {
  try {
    const { page, limit } = (req as ValidatedRequest).valid
      .query as SmsListQuery;
    const where = { workspaceId: workspaceIdOf(req) };

    const [total, rows] = await Promise.all([
      prisma.smsWalletTransaction.count({ where }),
      prisma.smsWalletTransaction.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { author: { select: { fullName: true } } },
      }),
    ]);

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount_rials: row.amountRials.toNumber(),
        balance_before_rials: row.balanceBeforeRials.toNumber(),
        balance_after_rials: row.balanceAfterRials.toNumber(),
        description: row.description,
        sms_message_id: row.smsMessageId,
        topup_id: row.topupId,
        created_at: row.createdAt.toISOString(),
        created_by_name: row.author?.fullName ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/sms/topups
export const topups = async (req: Request, res: Response) => {
  try {
    const { page, limit } = (req as ValidatedRequest).valid
      .query as SmsListQuery;
    const where = { workspaceId: workspaceIdOf(req) };

    const [total, rows] = await Promise.all([
      prisma.smsTopup.count({ where }),
      prisma.smsTopup.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { author: { select: { fullName: true } } },
      }),
    ]);

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        order_id: row.orderId,
        status: row.status,
        amount_rials: row.amountRials.toNumber(),
        ref_number: row.refNumber,
        card_number: row.cardNumber,
        paid_at: row.paidAt?.toISOString() ?? null,
        created_at: row.createdAt.toISOString(),
        created_by_name: row.author?.fullName ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/sms/messages
export const messages = async (req: Request, res: Response) => {
  try {
    const { page, limit } = (req as ValidatedRequest).valid
      .query as SmsListQuery;
    const where = { workspaceId: workspaceIdOf(req) };

    const [total, rows] = await Promise.all([
      prisma.smsMessage.count({ where }),
      prisma.smsMessage.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { name: true } },
          device: { select: { deviceName: true } },
          author: { select: { fullName: true } },
        },
      }),
    ]);

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        phone: row.phone,
        segments: row.segments,
        cost_rials: row.costRials.toNumber(),
        customer_id: row.customerId,
        customer_name: row.customer?.name ?? null,
        device_id: row.deviceId,
        device_name: row.device?.deviceName ?? null,
        // The provider's own words, for support. A shop is shown the status;
        // this is what an operator reads when asked why.
        error_message: row.errorMessage,
        created_at: row.createdAt.toISOString(),
        sent_at: row.sentAt?.toISOString() ?? null,
        created_by_name: row.author?.fullName ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/sms/settings
export const settings = async (req: Request, res: Response) => {
  try {
    const row = await prisma.settings.findUnique({
      where: { workspaceId: workspaceIdOf(req) },
      select: { smsCustomerNotificationsEnabled: true },
    });

    res.json({ enabled: row?.smsCustomerNotificationsEnabled ?? false });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// PATCH /api/sms/settings
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const { enabled } = (req as ValidatedRequest).valid.body as SmsSettingsBody;

    // updateMany rather than update: the latter needs a row to exist and
    // throws if it does not, and a workspace whose settings row is somehow
    // missing should not be met with a 500 for flipping a switch.
    const changed = await prisma.settings.updateMany({
      where: { workspaceId: workspaceIdOf(req) },
      data: { smsCustomerNotificationsEnabled: enabled },
    });

    if (changed.count === 0) {
      return res.status(404).json({ error: "تنظیمات کارگاه یافت نشد" });
    }

    res.json({ enabled });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

/**
 * GET /api/sms/capability — may this workspace send a message right now?
 *
 * The one endpoint here open to a technician, and it exists because of that
 * rather than despite it. A technician's device modal has to know whether
 * the checkbox works, and the wallet endpoint is the wrong way to tell them:
 * it would put a balance in a response their role is not meant to see, and
 * hiding it in the component would leave it in the network tab.
 *
 * So this answers the question the modal actually asks — may this device
 * send — as two flags and a reason, with **no amount in the payload at all**.
 */
export const capability = async (req: Request, res: Response) => {
  try {
    const workspaceId = workspaceIdOf(req);

    const [settingsRow, walletRow, unitPriceRials] = await Promise.all([
      prisma.settings.findUnique({
        where: { workspaceId },
        select: { smsCustomerNotificationsEnabled: true },
      }),
      prisma.smsWallet.findUnique({
        where: { workspaceId },
        select: { balanceRials: true },
      }),
      currentUnitPriceRials(),
    ]);

    const enabled = settingsRow?.smsCustomerNotificationsEnabled ?? false;
    const balanceRials = walletRow?.balanceRials.toNumber() ?? 0;
    const hasCredit = balanceRials >= unitPriceRials * PARTS_PER_MESSAGE;

    // Ordered the way notifyCustomer orders its refusals, so the modal says
    // the same thing the send would have recorded. A shop with notifications
    // off is not also told its credit is short.
    const reason = !enabled
      ? "disabled"
      : hasCredit
        ? null
        : "insufficient_balance";

    res.json({
      can_send: enabled && hasCredit,
      reason,
      notifications_enabled: enabled,
      // How much of a customer's name and device will actually appear, so a
      // modal can show the shop what the message will say rather than
      // discovering the cut afterwards.
      parameter_caps: PARAM_CAPS,
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
