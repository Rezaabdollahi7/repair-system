import { loginSchema, otpCodeSchema, registerSchema } from "../schemas/auth";
import { personnelCreateSchema } from "../schemas/personnel";

const validRegistration = {
  workspace_name: "تعمیرگاه رضا",
  username: "09123456789",
  password: "testpass123",
  // Required since OTP.4: the code is the proof the number is real, and it
  // is spent in the same request that creates the workspace.
  code: "12345",
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

describe("personnel and sign-up agree on what a username is", () => {
  const validPersonnel = {
    full_name: "علی محمدی",
    username: "09123456789",
    password: "testpass123",
    role_id: 3,
  };

  it("normalises a technician's number the same way", () => {
    const parsed = personnelCreateSchema.parse({
      ...validPersonnel,
      username: "۰۹۱۲۳۴۵۶۷۸۹",
    });

    expect(parsed.username).toBe("09123456789");
  });

  it("rejects a username login would not accept", () => {
    // The bug this guards against is silent: the account is created, appears
    // in the list, reads as active — and can be signed into by nobody,
    // because loginSchema rejects the username it was given.
    const result = personnelCreateSchema.safeParse({
      ...validPersonnel,
      username: "ali_tech",
    });

    expect(result.success).toBe(false);
  });

  it("holds every account to the same password minimum", () => {
    expect(
      personnelCreateSchema.safeParse({
        ...validPersonnel,
        password: "short12",
      }).success,
    ).toBe(false);
  });
});

describe("otpCodeSchema", () => {
  it("keeps a leading zero", () => {
    // The one that would break quietly. Codes are generated with padStart,
    // so 00042 is as likely as any other — and a z.coerce.number() added
    // later would turn it into 42 and refuse it, for one user in ten, with
    // nothing in the logs to say why.
    expect(otpCodeSchema.parse("00042")).toBe("00042");
  });

  it("accepts a code typed on a Persian keyboard", () => {
    // Same reasoning as phoneSchema: the rule is applied server-side so it
    // holds however the client was written.
    expect(otpCodeSchema.parse("۱۲۳۴۵")).toBe("12345");
  });

  it("accepts Arabic-Indic digits too", () => {
    expect(otpCodeSchema.parse("٠٩٨٧٦")).toBe("09876");
  });

  it("trims surrounding whitespace", () => {
    // Pasted from an SMS, a trailing space is routine.
    expect(otpCodeSchema.parse(" 12345 ")).toBe("12345");
  });

  it.each(["1234", "123456", "abcde", "", "12 45"])("rejects %s", (input) => {
    expect(otpCodeSchema.safeParse(input).success).toBe(false);
  });
});
