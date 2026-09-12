import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import { sendTemplate, SmsError } from "../lib/sms";
import { phoneSchema } from "../schemas/auth";
import { errorMessage } from "./errors";
import { priceMessage } from "./smsPricing";
import { renderDeviceSms, type DeviceSmsKind } from "./smsTemplates";
import { debitWallet, isDuplicateRefund, refundMessage } from "./smsWallet";
import type { Prisma } from "../generated/prisma/client";

/**
 * The layer between a device changing and a customer's phone buzzing.
 *
 *     deviceController → customerNotification → smsWallet + lib/sms
 *
 * Nothing above this knows about wallets, parts or templates; nothing below
 * knows about devices. It is the only caller of the wallet's debit, which is
 * what makes "every message is paid for exactly once" checkable in one file
 * rather than wherever a send happens to be written next.
 */

/** Derived from the generated client, so a schema change is a compile error. */
type SmsMessageStatus = Prisma.SmsMessageUncheckedCreateInput["status"];

export interface NotifyInput {
  workspaceId: number;
  kind: DeviceSmsKind;
  device: {
    id: number;
    deviceName: string;
    customerId: number | null;
    customer: { name: string; phone: string | null } | null;
  };
  actorId?: number | null;
}

export interface NotifyOutcome {
  /** Null when nothing was recorded, which only happens on an internal error. */
  smsMessageId: number | null;
  status: SmsMessageStatus;
  /** Rials actually taken. Zero for every refusal, and after a refund. */
  costRials: number;
}

/**
 * What a workshop's settings say, plus the name that goes in the message.
 *
 * One query rather than two: this runs on the device write path, and the RLS
 * design already costs two round trips for each.
 */
async function workshopContext(workspaceId: number) {
  const [settings, workspace] = await Promise.all([
    prisma.settings.findUnique({
      where: { workspaceId },
      select: { smsCustomerNotificationsEnabled: true, companyName: true },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    }),
  ]);

  return {
    // A workspace with no settings row cannot have turned this on, so the
    // answer is the same as off. populateWorkspace always writes one.
    enabled: settings?.smsCustomerNotificationsEnabled ?? false,
    // The shop's own trading name if it has set one, falling back to the
    // workspace name it signed up with. The customer should recognise it.
    shopName: settings?.companyName || workspace?.name || null,
  };
}

/**
 * Records an attempt that never reached the provider.
 *
 * Every refusal is a row, not a silence: "why did my customer not get a
 * text" is the question sms_messages exists to answer, and "we decided not
 * to send it" is an answer. Nothing is charged, so there is no ledger line.
 */
async function recordRefusal(
  input: NotifyInput,
  status: SmsMessageStatus,
  phone: string,
  unitPriceRials: number,
  errorMessageText?: string,
): Promise<NotifyOutcome> {
  const row = await prisma.smsMessage.create({
    data: {
      workspaceId: input.workspaceId,
      customerId: input.device.customerId,
      deviceId: input.device.id,
      phone,
      kind: input.kind,
      unitPriceRials,
      costRials: 0,
      status,
      createdBy: input.actorId ?? null,
      errorMessage: errorMessageText,
    },
    select: { id: true },
  });

  return { smsMessageId: row.id, status, costRials: 0 };
}

/**
 * Sends one customer notification, or records why it did not.
 *
 * The order is the brief's §29 and is not negotiable: the device write has
 * already committed by the time this is called, and the provider call
 * happens outside any transaction. A send takes up to twenty seconds, and
 * holding a row lock that long for a text message is the mistake 8.10 caught
 * once already.
 *
 * Never throws. A workshop whose device update succeeded must not see a 500
 * because a message could not be sent — the outcome comes back for the
 * response to carry, and anything unexpected is logged rather than raised.
 */
export async function notifyCustomer(
  input: NotifyInput,
): Promise<NotifyOutcome> {
  const { workspaceId } = input;

  try {
    const { enabled, shopName } = await workshopContext(workspaceId);

    // Normalised through the same schema sign-up and login use, so one
    // number is one number however the shop typed it. A landline, a blank,
    // or something with letters in it lands here — all real, none sendable.
    const parsed = phoneSchema.safeParse(input.device.customer?.phone ?? "");
    const rawPhone = input.device.customer?.phone ?? "";

    if (!enabled) {
      // Checked before the phone: a shop that has notifications off should
      // not also be told its customer's number is wrong.
      return await recordRefusal(
        input,
        "disabled",
        parsed.success ? (parsed.data as string) : rawPhone,
        await currentPriceOrZero(),
      );
    }

    if (!parsed.success) {
      return await recordRefusal(
        input,
        "invalid_phone",
        rawPhone,
        await currentPriceOrZero(),
      );
    }

    const phone = parsed.data as string;

    const rendered = renderDeviceSms(input.kind, {
      customerName: input.device.customer?.name ?? null,
      deviceName: input.device.deviceName,
      receptionNumber: input.device.id,
      workspaceName: shopName,
    });

    // Throws if no price is in force, and that is the right direction: a
    // refusal can be recorded at zero because nothing was charged, but a
    // real send priced at zero is a free message, which is the failure
    // nobody notices until the provider's bill arrives.
    const price = await priceMessage(rendered.text);

    // The row and the debit land together. The row has to exist first
    // because the ledger line points at it, and both have to be in one
    // transaction so a charge without a message — or a message nobody paid
    // for — is not a state the database can hold.
    const claimed = await runInWorkspaceTransaction(
      workspaceId,
      async (tx) => {
        const message = await tx.smsMessage.create({
          data: {
            workspaceId,
            customerId: input.device.customerId,
            deviceId: input.device.id,
            phone,
            kind: input.kind,
            segments: price.segments,
            unitPriceRials: price.unitPriceRials,
            costRials: price.costRials,
            status: "pending",
            createdBy: input.actorId ?? null,
          },
          select: { id: true },
        });

        const debit = await debitWallet(tx, workspaceId, {
          costRials: price.costRials,
          smsMessageId: message.id,
          description: `پیامک ${input.kind} — دستگاه ${input.device.id}`,
          createdBy: input.actorId ?? null,
        });

        if (!debit.ok) {
          // Marked inside the same transaction rather than after it: the row
          // is already written, and leaving it `pending` would make it look
          // like a message still in flight to the recovery sweep.
          await tx.smsMessage.update({
            where: { id: message.id },
            data: { status: "insufficient_balance", costRials: 0 },
          });

          return { id: message.id, funded: false as const };
        }

        return { id: message.id, funded: true as const };
      },
    );

    if (!claimed.funded) {
      return {
        smsMessageId: claimed.id,
        status: "insufficient_balance",
        costRials: 0,
      };
    }

    // Outside the transaction, deliberately. See the note at the top.
    try {
      const result = await sendTemplate(
        phone,
        rendered.template,
        rendered.parameters,
      );

      await prisma.smsMessage.update({
        where: { id: claimed.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          providerMessageId: String(result.messageId),
        },
      });

      return {
        smsMessageId: claimed.id,
        status: "sent",
        costRials: price.costRials,
      };
    } catch (error) {
      // The money is already gone and the message never left. Giving it back
      // is the whole reason refundMessage exists.
      return await refundFailedSend(
        workspaceId,
        claimed.id,
        price.costRials,
        error,
      );
    }
  } catch (error) {
    // Anything unexpected: a database error, a template that does not
    // render, a price that cannot be read. Logged rather than thrown,
    // because the device write has already succeeded and the shop must not
    // be told otherwise — but logged loudly, which is what 8.10 found
    // missing when two SMS paths swallowed their errors in silence.
    console.error(
      `customer notification failed for device ${input.device.id} in workspace ${workspaceId}:`,
      errorMessage(error),
    );

    return { smsMessageId: null, status: "failed", costRials: 0 };
  }
}

/**
 * The unit price, or zero if there isn't one.
 *
 * Only ever used for a refusal row, where it records what the message would
 * have cost and nothing is charged. A shop with notifications switched off
 * must not have its device update logged as an internal failure because the
 * price table is empty — whereas an actual send in that state must fail,
 * which is why the send path calls priceMessage directly.
 */
async function currentPriceOrZero(): Promise<number> {
  try {
    return (await priceMessage("")).unitPriceRials;
  } catch {
    return 0;
  }
}

/**
 * Gives back what a failed send cost, and records what the provider said.
 *
 * Its own transaction, as refundMessage requires: a duplicate aborts the
 * transaction it runs in, so sharing one with the status update would take
 * that with it.
 */
async function refundFailedSend(
  workspaceId: number,
  smsMessageId: number,
  costRials: number,
  error: unknown,
): Promise<NotifyOutcome> {
  const providerStatus = error instanceof SmsError ? error.providerStatus : null;

  let refunded = false;

  try {
    await runInWorkspaceTransaction(workspaceId, (tx) =>
      refundMessage(tx, workspaceId, {
        smsMessageId,
        amountRials: costRials,
        description: "بازگشت هزینه پیامک ارسال‌نشده",
      }),
    );
    refunded = true;
  } catch (refundError) {
    if (isDuplicateRefund(refundError)) {
      // Already given back by an earlier attempt. Not a problem, and the
      // balance is right either way.
      refunded = true;
    } else {
      // The one case worth shouting about: the shop has been charged for a
      // message that never went. Logged with both errors, since the refund
      // failing and the send failing are different faults.
      console.error(
        `refund failed for sms ${smsMessageId} in workspace ${workspaceId}:`,
        errorMessage(refundError),
      );
    }
  }

  const status: SmsMessageStatus = refunded ? "refunded" : "failed";

  await prisma.smsMessage.update({
    where: { id: smsMessageId },
    data: {
      status,
      errorCode: providerStatus === null ? null : String(providerStatus),
      errorMessage: errorMessage(error),
      // Zero once the money is back, so summing this column answers "what
      // did this workshop actually spend".
      costRials: refunded ? 0 : costRials,
    },
  });

  return { smsMessageId, status, costRials: refunded ? 0 : costRials };
}
