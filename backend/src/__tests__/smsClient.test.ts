// A plain import works because jest.setup.ts supplies SMS_API_KEY and
// SMS_TEMPLATE_ID before any suite loads — lib/sms reads them at module load
// and throws without them, the same way lib/prisma and lib/storage do.
import { sendVerificationCode, SMS_STATUS } from "../lib/sms";

let fetchMock: jest.Mock;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("sendVerificationCode", () => {
  it("sends ten digits without the leading zero", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 1, data: { messageId: 89545112, cost: 1 } }),
    );

    await sendVerificationCode("09123456789", "12345");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    // The provider's own example is 919xxxx904 — eleven digits would be a
    // different number, not a formatting difference.
    expect(body.mobile).toBe("9123456789");
    expect(body.templateId).toBe(123456);
    expect(body.parameters).toEqual([{ name: "Code", value: "12345" }]);
  });

  it("returns the message id and cost on success", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 1, data: { messageId: 89545112, cost: 1.5 } }),
    );

    const result = await sendVerificationCode("09123456789", "12345");

    expect(result).toEqual({ messageId: 89545112, cost: 1.5 });
  });

  it("treats HTTP 200 with status 0 as a failure", async () => {
    // The trap this module exists to close: the body's status is not the HTTP
    // status, so an exhausted account arrives looking like a delivered message.
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 102, message: "اعتبار کافی نیست" }),
    );

    await expect(
      sendVerificationCode("09123456789", "12345"),
    ).rejects.toMatchObject({
      name: "SmsError",
      providerStatus: SMS_STATUS.CREDIT_EXHAUSTED,
    });
  });

  it("carries the provider status so the caller can branch on it", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 115, message: "شماره در لیست سیاه است" }),
    );

    await expect(
      sendVerificationCode("09123456789", "12345"),
    ).rejects.toMatchObject({ providerStatus: SMS_STATUS.BLACKLISTED });
  });

  it("reports a non-200 response with no provider status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(
      sendVerificationCode("09123456789", "12345"),
    ).rejects.toMatchObject({ providerStatus: null });
  });

  it("reports a network failure without pretending it was a rejection", async () => {
    fetchMock.mockRejectedValue(new Error("getaddrinfo EAI_AGAIN api.sms.ir"));

    await expect(
      sendVerificationCode("09123456789", "12345"),
    ).rejects.toMatchObject({ providerStatus: null });
  });

  it("refuses a number that is not an Iranian mobile", async () => {
    // Defence in depth: phoneSchema already guarantees this shape, but a
    // wrong number here delivers someone's code to a stranger.
    await expect(
      sendVerificationCode("02112345678", "12345"),
    ).rejects.toMatchObject({ name: "SmsError" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never puts the code in the error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 113, message: "قالب" }));

    await expect(
      sendVerificationCode("09123456789", "98765"),
    ).rejects.toThrow(
      expect.not.stringContaining("98765") as unknown as string,
    );
  });
});
