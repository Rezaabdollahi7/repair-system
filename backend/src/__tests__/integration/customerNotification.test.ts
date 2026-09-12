// Only the provider is mocked. The wallet, the ledger, the transaction and
// the policies are all real, because what this module is for is holding
// those together — a mocked wallet would assert that the code calls the
// functions it calls, which is not the same as the money being right.
jest.mock("../../lib/sms", () => {
  const names = jest.requireActual("../../lib/smsTemplateNames");

  return {
    __esModule: true,
    SMS_TEMPLATES: names.SMS_TEMPLATES,
    MAX_PARAMETER_CHARS: 25,
    sendTemplate: jest.fn(),
    SmsError: class SmsError extends Error {
      readonly providerStatus: number | null;
      constructor(message: string, providerStatus: number | null) {
        super(message);
        this.name = "SmsError";
        this.providerStatus = providerStatus;
      }
    },
  };
});

import prisma from "../../lib/prisma";
import { sendTemplate, SmsError } from "../../lib/sms";
import { runWithWorkspace } from "../../lib/workspaceContext";
import { notifyCustomer } from "../../utils/customerNotification";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

let workspaces: TwoWorkspaces;

const UNIT_PRICE = 1_750;
/** Every approved template is two parts, so this is what one message costs. */
const COST = UNIT_PRICE * 2;

async function balance(workspaceId: number): Promise<number> {
  const wallet = await owner.smsWallet.findUniqueOrThrow({
    where: { workspaceId },
  });

  return wallet.balanceRials.toNumber();
}

async function seedWorkshop(
  workspaceId: number,
  options: { balanceRials: number; enabled: boolean },
) {
  await owner.smsWallet.create({
    data: { workspaceId, balanceRials: options.balanceRials },
  });

  await owner.settings.create({
    data: {
      workspaceId,
      companyName: "تعمیرگاه مرکزی",
      smsCustomerNotificationsEnabled: options.enabled,
    },
  });
}

/** A customer and a device for them, returned in the shape notifyCustomer wants. */
async function seedDevice(workspaceId: number, phone: string | null) {
  const customer = await owner.customer.create({
    data: { workspaceId, name: "علی رضایی", phone },
    select: { id: true, name: true, phone: true },
  });

  const device = await owner.device.create({
    data: { workspaceId, customerId: customer.id, deviceName: "یخچال" },
    select: { id: true, deviceName: true, customerId: true },
  });

  return {
    ...device,
    customer: { name: customer.name, phone: customer.phone },
  };
}

function notify(
  workspaceId: number,
  device: Awaited<ReturnType<typeof seedDevice>>,
) {
  return runWithWorkspace(workspaceId, async () =>
    notifyCustomer({
      workspaceId,
      kind: "device_ready",
      device,
      actorId: null,
    }),
  );
}

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  jest.clearAllMocks();

  // sms_prices is reference data from the 12.1 migration, and truncateAll
  // empties it like every other table.
  await owner.smsPrice.create({
    data: { unitPriceRials: UNIT_PRICE, effectiveFrom: new Date("2026-01-01") },
  });

  jest.mocked(sendTemplate).mockResolvedValue({ messageId: 55_123, cost: 2 });
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

describe("a message that goes out", () => {
  it("sends it, charges for it, and records both", async () => {
    const workspaceId = workspaces.a.workspaceId;
    await seedWorkshop(workspaceId, { balanceRials: 100_000, enabled: true });
    const device = await seedDevice(workspaceId, "09121234567");

    const outcome = await notify(workspaceId, device);

    expect(outcome.status).toBe("sent");
    expect(outcome.costRials).toBe(COST);
    expect(await balance(workspaceId)).toBe(100_000 - COST);

    const row = await owner.smsMessage.findUniqueOrThrow({
      where: { id: outcome.smsMessageId! },
    });
    expect(row.status).toBe("sent");
    expect(row.segments).toBe(2);
    expect(row.unitPriceRials.toNumber()).toBe(UNIT_PRICE);
    expect(row.providerMessageId).toBe("55123");
    expect(row.sentAt).not.toBeNull();
  });

  it("hands the provider the four approved parameters", async () => {
    const workspaceId = workspaces.a.workspaceId;
    await seedWorkshop(workspaceId, { balanceRials: 100_000, enabled: true });
    const device = await seedDevice(workspaceId, "09121234567");

    await notify(workspaceId, device);

    const [phone, , parameters] = jest.mocked(sendTemplate).mock.calls[0];

    expect(phone).toBe("09121234567");
    expect(Object.keys(parameters).sort()).toEqual([
      "DEVICE",
      "NAME",
      "NUMBER",
      "SHOP",
    ]);
    // The reception number is the device id, which is what the shop quotes.
    expect(parameters.NUMBER).toBe(String(device.id));
    expect(parameters.SHOP).toBe("تعمیرگاه مرکزی");
  });

  it("normalises whatever the shop typed into the number it dials", async () => {
    // Through the same schema sign-up and login use. A number saved with
    // Persian digits and a +98 prefix is one a shop really has.
    const workspaceId = workspaces.a.workspaceId;
    await seedWorkshop(workspaceId, { balanceRials: 100_000, enabled: true });
    const device = await seedDevice(workspaceId, "+98 ۹۱۲-۱۲۳۴۵۶۷");

    const outcome = await notify(workspaceId, device);

    expect(outcome.status).toBe("sent");
    expect(jest.mocked(sendTemplate).mock.calls[0][0]).toBe("09121234567");
    // Stored as it was used, not as the customer row has it.
    const row = await owner.smsMessage.findUniqueOrThrow({
      where: { id: outcome.smsMessageId! },
    });
    expect(row.phone).toBe("09121234567");
  });

  it("keeps the balance equal to the sum of its ledger", async () => {
    const workspaceId = workspaces.a.workspaceId;
    await seedWorkshop(workspaceId, { balanceRials: 100_000, enabled: true });

    for (const phone of ["09121234567", "09121234568", "09121234569"]) {
      await notify(workspaceId, await seedDevice(workspaceId, phone));
    }

    const rows = await owner.smsWalletTransaction.findMany({
      where: { workspaceId },
    });
    const summed = rows.reduce(
      (total, row) => total + row.amountRials.toNumber(),
      100_000,
    );

    expect(rows).toHaveLength(3);
    expect(await balance(workspaceId)).toBe(summed);
  });
});

describe("a message that is refused", () => {
  it("records the refusal and charges nothing when the credit is short", async () => {
    const workspaceId = workspaces.a.workspaceId;
    await seedWorkshop(workspaceId, { balanceRials: 1_000, enabled: true });
    const device = await seedDevice(workspaceId, "09121234567");

    const outcome = await notify(workspaceId, device);

    expect(outcome.status).toBe("insufficient_balance");
    expect(outcome.costRials).toBe(0);
    expect(await balance(workspaceId)).toBe(1_000);
    expect(jest.mocked(sendTemplate)).not.toHaveBeenCalled();

    // A row rather than a silence: this is the question sms_messages exists
    // to answer. And no ledger line, because nothing was taken.
    const row = await owner.smsMessage.findUniqueOrThrow({
      where: { id: outcome.smsMessageId! },
    });
    expect(row.status).toBe("insufficient_balance");
    expect(row.costRials.toNumber()).toBe(0);
    expect(
      await owner.smsWalletTransaction.count({ where: { workspaceId } }),
    ).toBe(0);
  });

  it("says nothing about the phone when notifications are off", async () => {
    // A shop that has switched this off should not also be told its
    // customer's number is wrong — the toggle is the reason, and the reason
    // is what the row is for.
    const workspaceId = workspaces.a.workspaceId;
    await seedWorkshop(workspaceId, { balanceRials: 100_000, enabled: false });
    const device = await seedDevice(workspaceId, "not a phone at all");

    const outcome = await notify(workspaceId, device);

    expect(outcome.status).toBe("disabled");
    expect(await balance(workspaceId)).toBe(100_000);
    expect(jest.mocked(sendTemplate)).not.toHaveBeenCalled();
  });

  it("refuses a customer with no number, and one with a landline", async () => {
    // Customer.phone is free-form and optional, and a landline customer is a
    // real customer — so this is a recorded refusal rather than a validation
    // error on the device write that caused it.
    const workspaceId = workspaces.a.workspaceId;
    await seedWorkshop(workspaceId, { balanceRials: 100_000, enabled: true });

    for (const phone of [null, "02112345678", ""]) {
      const outcome = await notify(
        workspaceId,
        await seedDevice(workspaceId, phone),
      );

      expect(outcome.status).toBe("invalid_phone");
    }

    expect(await balance(workspaceId)).toBe(100_000);
    expect(jest.mocked(sendTemplate)).not.toHaveBeenCalled();
  });
});

describe("a message the provider refuses", () => {
  it("gives the money back and records what was said", async () => {
    const workspaceId = workspaces.a.workspaceId;
    await seedWorkshop(workspaceId, { balanceRials: 100_000, enabled: true });
    const device = await seedDevice(workspaceId, "09121234567");

    jest
      .mocked(sendTemplate)
      .mockRejectedValue(new SmsError("blacklisted", 115));

    const outcome = await notify(workspaceId, device);

    expect(outcome.status).toBe("refunded");
    expect(outcome.costRials).toBe(0);
    // Exactly where it started. The debit and the refund are both real rows.
    expect(await balance(workspaceId)).toBe(100_000);

    const row = await owner.smsMessage.findUniqueOrThrow({
      where: { id: outcome.smsMessageId! },
    });
    expect(row.status).toBe("refunded");
    expect(row.errorCode).toBe("115");
    expect(row.errorMessage).toMatch(/blacklisted/);
    // Zeroed once the money is back, so summing this column answers what the
    // workshop actually spent.
    expect(row.costRials.toNumber()).toBe(0);

    const ledger = await owner.smsWalletTransaction.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    });
    expect(ledger.map((r) => r.type)).toEqual(["send", "refund"]);
  });

  it("never throws, so a device update is not undone by a text message", async () => {
    // The device write has already committed by the time this runs. A
    // workshop whose repair job saved correctly must not be shown a failure
    // because sms.ir was unreachable.
    const workspaceId = workspaces.a.workspaceId;
    await seedWorkshop(workspaceId, { balanceRials: 100_000, enabled: true });
    const device = await seedDevice(workspaceId, "09121234567");

    jest.mocked(sendTemplate).mockRejectedValue(new Error("socket hang up"));

    await expect(notify(workspaceId, device)).resolves.toMatchObject({
      status: "refunded",
    });
    expect(await balance(workspaceId)).toBe(100_000);
  });
});

describe("one workshop cannot spend another's credit", () => {
  it("charges the workspace the device belongs to, and only that one", async () => {
    await seedWorkshop(workspaces.a.workspaceId, {
      balanceRials: 100_000,
      enabled: true,
    });
    await seedWorkshop(workspaces.b.workspaceId, {
      balanceRials: 500_000,
      enabled: true,
    });

    const device = await seedDevice(workspaces.a.workspaceId, "09121234567");
    await notify(workspaces.a.workspaceId, device);

    expect(await balance(workspaces.a.workspaceId)).toBe(100_000 - COST);
    expect(await balance(workspaces.b.workspaceId)).toBe(500_000);
    expect(
      await owner.smsMessage.count({
        where: { workspaceId: workspaces.b.workspaceId },
      }),
    ).toBe(0);
  });
});
