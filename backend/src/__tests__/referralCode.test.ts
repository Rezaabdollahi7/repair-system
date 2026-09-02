import {
  createReferralCode,
  generateReferralCode,
} from "../utils/referralCode";

describe("generateReferralCode", () => {
  it("is six characters from an alphabet a human can read aloud", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateReferralCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it("does not repeat itself", () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => generateReferralCode()),
    );

    expect(codes.size).toBe(500);
  });
});

describe("createReferralCode", () => {
  function makeTx(takenCodes: string[]) {
    const remaining = [...takenCodes];

    return {
      referralCode: {
        findUnique: jest.fn(({ where }: { where: { code: string } }) => {
          // Report the first N generated codes as taken, whatever they are,
          // so the retry path can be exercised without knowing them.
          if (remaining.length > 0) {
            remaining.pop();
            return Promise.resolve({ id: 1, code: where.code });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
  }

  it("writes the code it returns", async () => {
    const tx = makeTx([]);

    const code = await createReferralCode(tx as never, 5);

    expect(tx.referralCode.create).toHaveBeenCalledWith({
      data: { workspaceId: 5, code },
    });
  });

  it("tries again when a code is already taken", async () => {
    const tx = makeTx(["x", "x"]);

    await createReferralCode(tx as never, 5);

    expect(tx.referralCode.findUnique).toHaveBeenCalledTimes(3);
    expect(tx.referralCode.create).toHaveBeenCalledTimes(1);
  });

  it("gives up rather than looping forever inside sign-up", async () => {
    const tx = makeTx(Array(20).fill("x"));

    await expect(createReferralCode(tx as never, 5)).rejects.toThrow(
      "Could not find an unused referral code",
    );

    expect(tx.referralCode.findUnique).toHaveBeenCalledTimes(5);
    expect(tx.referralCode.create).not.toHaveBeenCalled();
  });
});
