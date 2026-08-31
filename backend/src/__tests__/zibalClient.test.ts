import { generateOrderId } from "../utils/orderId";

const ORIGINAL_MERCHANT = process.env.ZIBAL_MERCHANT;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

/**
 * Imported inside each test rather than at the top: the module reads its
 * merchant and checks NODE_ENV at import time, so a test about that check has
 * to control the environment before the import happens.
 */
async function loadZibal() {
  jest.resetModules();
  return import("../lib/zibal");
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  process.env.ZIBAL_MERCHANT = "test-merchant";
  process.env.APP_URL = "https://app.example.test";
  // ⚠️ Assigning undefined would leave the string "undefined" behind for
  // whatever runs next — the trap productionHardening.test.ts already found.
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

afterAll(() => {
  if (ORIGINAL_MERCHANT === undefined) delete process.env.ZIBAL_MERCHANT;
  else process.env.ZIBAL_MERCHANT = ORIGINAL_MERCHANT;
});

describe("configuration", () => {
  it("refuses to start without a merchant", async () => {
    delete process.env.ZIBAL_MERCHANT;

    await expect(loadZibal()).rejects.toThrow("ZIBAL_MERCHANT is not set");
  });

  it("refuses to run production against the shared test merchant", async () => {
    // The difference between test and live is one string in a file, and the
    // failure is silent: subscriptions activate against money that never
    // moved, and everything looks healthy.
    process.env.NODE_ENV = "production";
    process.env.ZIBAL_MERCHANT = "zibal";

    await expect(loadZibal()).rejects.toThrow("shared test merchant");
  });

  it("allows the test merchant outside production", async () => {
    process.env.NODE_ENV = "development";
    process.env.ZIBAL_MERCHANT = "zibal";

    await expect(loadZibal()).resolves.toBeDefined();
  });

  it("refuses to start without an app url", async () => {
    // The callback is built from it, and Zibal refuses one whose domain is
    // not the registered domain (result 106). Read at import so a deployment
    // that forgets it fails at boot rather than on the first customer who
    // tries to pay.
    delete process.env.APP_URL;

    await expect(loadZibal()).rejects.toThrow("APP_URL is not set");
  });
});

describe("requestPayment", () => {
  it("sends the merchant and returns the track id", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ result: 100, trackId: 15966442233311 }),
      );
    global.fetch = fetchMock as never;

    const { requestPayment } = await loadZibal();

    const { trackId } = await requestPayment({
      amountRials: 19_900_000,
      orderId: "DFX-1-abc",
      description: "اشتراک ۳ ماهه",
      mobile: "09120000000",
    });

    // BigInt, matching the column: trackId is int64 in their API and the
    // values are already past what a float can hold exactly.
    expect(trackId).toBe(15966442233311n);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.merchant).toBe("test-merchant");
    expect(sent.amount).toBe(19_900_000);
  });

  it("names the result code when Zibal refuses", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ result: 115, message: "ip not registered" }),
      ) as never;

    const { requestPayment, ZIBAL_RESULT } = await loadZibal();

    // ⚠️ Unlike sms.ir, which answers an unlisted address with a bare 401,
    // Zibal says which problem it is. The hour that cost must not repeat.
    await expect(
      requestPayment({
        amountRials: 1000,
        orderId: "DFX-1-abc",
        description: "x",
      }),
    ).rejects.toMatchObject({ result: ZIBAL_RESULT.IP_NOT_REGISTERED });
  });

  it("treats an unreachable gateway as a failure with no result", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("timeout")) as never;

    const { requestPayment } = await loadZibal();

    await expect(
      requestPayment({
        amountRials: 1000,
        orderId: "DFX-1-abc",
        description: "x",
      }),
    ).rejects.toMatchObject({ result: null });
  });
});

describe("verifyPayment", () => {
  it("reports a fresh confirmation as newly verified", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        result: 100,
        amount: 19_900_000,
        refNumber: 12312,
        cardNumber: "62741****44",
        paidAt: "2026-08-30T10:00:00.000",
      }),
    ) as never;

    const { verifyPayment } = await loadZibal();
    const verified = await verifyPayment(15966442233311n);

    expect(verified.newlyVerified).toBe(true);
    expect(verified.amountRials).toBe(19_900_000);
    expect(verified.refNumber).toBe("12312");
  });

  it("treats 201 as success but not as a fresh one", async () => {
    // The customer refreshed the return page. Resolving lets the caller show
    // them their subscription; newlyVerified being false is what stops it
    // being extended a second time for one payment.
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ result: 201, amount: 19_900_000 }),
      ) as never;

    const { verifyPayment } = await loadZibal();
    const verified = await verifyPayment(1n);

    expect(verified.newlyVerified).toBe(false);
  });

  it("throws when the payment never happened", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ result: 202, message: "not paid" }),
      ) as never;

    const { verifyPayment, ZIBAL_RESULT } = await loadZibal();

    await expect(verifyPayment(1n)).rejects.toMatchObject({
      result: ZIBAL_RESULT.NOT_PAID,
    });
  });
});

describe("inquirePayment", () => {
  it.each([
    [1, true],
    [2, true],
    [3, false],
    [-1, false],
  ])("reads status %i as paid=%s", async (status, paid) => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ result: 100, status, amount: 100 }),
      ) as never;

    const { inquirePayment } = await loadZibal();

    expect((await inquirePayment(1n)).paid).toBe(paid);
  });
});

describe("generateOrderId", () => {
  it("carries the workspace and does not repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateOrderId(42)));

    expect(ids.size).toBe(500);
    expect([...ids][0]).toMatch(/^DFX-42-[0-9a-f]{12}$/);
  });
});
