import { loginSchema, registerSchema } from "../schemas/auth";

const validRegistration = {
  workspace_name: "تعمیرگاه رضا",
  username: "09123456789",
  password: "testpass123",
};

describe("phone normalisation", () => {
  // The same preprocessing runs on sign-up and login. If it ran on only one
  // of them, someone could register as ۰۹۱۲۳۴۵۶۷۸۹ and then be unable to
  // sign in as 09123456789, with nothing to explain why.
  const cases: [string, string][] = [
    ["۰۹۱۲۳۴۵۶۷۸۹", "Persian digits"],
    ["٠٩١٢٣٤٥٦٧٨٩", "Arabic-Indic digits"],
    ["0912 345 6789", "spaces"],
    ["0912-345-6789", "dashes"],
    ["+989123456789", "+98 prefix"],
    ["00989123456789", "0098 prefix"],
    ["989123456789", "bare 98 prefix"],
  ];

  it.each(cases)("accepts %s (%s)", (input) => {
    const registered = registerSchema.parse({
      ...validRegistration,
      username: input,
    });
    const loggedIn = loginSchema.parse({ username: input, password: "x" });

    expect(registered.username).toBe("09123456789");
    expect(loggedIn.username).toBe("09123456789");
  });
});

describe("registerSchema", () => {
  it("rejects a landline", () => {
    // Excluded deliberately: the username doubles as the channel for the SMS
    // verification planned in 8.6, which a landline cannot receive.
    const result = registerSchema.safeParse({
      ...validRegistration,
      username: "02112345678",
    });

    expect(result.success).toBe(false);
  });

  it.each(["0912345678", "091234567890"])(
    "rejects the wrong number of digits: %s",
    (username) => {
      expect(
        registerSchema.safeParse({ ...validRegistration, username }).success,
      ).toBe(false);
    },
  );

  it("rejects a password under eight characters", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: "short12",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a long password without composition rules", () => {
    // Rules demanding a symbol and a capital tend to produce Reza@1234
    // rather than a better password; length is what costs an attacker
    // anything.
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: "correct horse battery staple",
    });

    expect(result.success).toBe(true);
  });

  it("trims the workspace name and rejects an empty one", () => {
    expect(
      registerSchema.parse({ ...validRegistration, workspace_name: "  رضا  " })
        .workspace_name,
    ).toBe("رضا");

    expect(
      registerSchema.safeParse({ ...validRegistration, workspace_name: " " })
        .success,
    ).toBe(false);
  });
});
