import { MAX_PARAMETER_CHARS, SMS_TEMPLATES } from "../lib/sms";
import { countSegments } from "../utils/smsPricing";
import {
  DEVICE_SMS,
  PARAM_CAPS,
  renderDeviceSms,
  type DeviceSmsKind,
} from "../utils/smsTemplates";

const KINDS: DeviceSmsKind[] = [
  "device_accepted",
  "device_ready",
  "device_delivered",
];

const ordinary = {
  customerName: "علی رضایی",
  deviceName: "یخچال",
  receptionNumber: 1042,
  workspaceName: "تعمیرگاه مرکزی",
};

describe("the approved bodies", () => {
  it("uses exactly the four parameters the panel approved", () => {
    // The one failure no test that mocks the provider can catch: a template
    // approved with #CUSTOMER# where the code sends #NAME# is a rejected
    // message at send time, on a real customer's phone. Pinned here against
    // the bodies as approved on 1405/06/19.
    for (const kind of KINDS) {
      const found = DEVICE_SMS[kind].body.match(/#[A-Z]+#/g) ?? [];

      expect(new Set(found)).toEqual(
        new Set(["#NAME#", "#DEVICE#", "#NUMBER#", "#SHOP#"]),
      );
    }
  });

  it("names the organisation in fixed text, not a parameter", () => {
    // The rule the first submission was refused under: «نام مجموعه باید ثابت
    // باشد». If somebody ever turns دوفیکسو into a variable to make the
    // message feel more like the workshop's own, the template stops being
    // approvable — so the constraint is written down as a test.
    for (const kind of KINDS) {
      expect(DEVICE_SMS[kind].body).toContain("دوفیکسو");
    }
  });

  it("costs two parts at the caps, and never three", () => {
    // What the whole feature's margin rests on. A third part is a third of
    // the message's cost again, on every message, silently.
    for (const kind of KINDS) {
      const longest = renderDeviceSms(kind, {
        customerName: "ا".repeat(PARAM_CAPS.NAME),
        deviceName: "ب".repeat(PARAM_CAPS.DEVICE),
        // The full cap, not a comfortable number: `ready` lands on exactly
        // 134 characters here, which is the last one that fits two parts.
        // A test that used a shorter id would pass while the real ceiling
        // had already been crossed.
        receptionNumber: 9_999_999_999,
        workspaceName: "پ".repeat(PARAM_CAPS.SHOP),
      });

      expect(String(9_999_999_999).length).toBe(PARAM_CAPS.NUMBER);
      expect(countSegments(longest.text)).toBe(2);
    }
  });

  it("never truncates a reception number", () => {
    // The one value where a cut is a lie rather than an abbreviation: a
    // shortened name still names the customer, a shortened number is a
    // different number, and it is the thing they read back over the phone.
    const { parameters } = renderDeviceSms("device_ready", {
      ...ordinary,
      receptionNumber: 9_999_999_999,
    });

    expect(parameters.NUMBER).toBe("9999999999");
  });

  it("keeps every cap inside what sms.ir accepts", () => {
    // The provider's ceiling is 25 and sendTemplate throws above it. These
    // caps are what stops a real name reaching that throw.
    for (const cap of Object.values(PARAM_CAPS)) {
      expect(cap).toBeLessThanOrEqual(MAX_PARAMETER_CHARS);
    }
  });

  it("has an environment value for every name in SMS_TEMPLATES", () => {
    // lib/sms resolves all of them at import, so this is really a test that
    // the suite could start at all — which it could not, twice, when a
    // template was added and the test setup was not.
    //
    // Asserted rather than left to the import throw because the throw lands
    // in whichever unrelated suite imports app.ts first, and reads as a
    // broken invoice test rather than a missing line in providerEnv.
    for (const name of Object.values(SMS_TEMPLATES)) {
      expect(process.env[name]).toBeDefined();
    }
  });

  it("points each kind at its own template", () => {
    expect(DEVICE_SMS.device_accepted.template).toBe(
      SMS_TEMPLATES.DEVICE_ACCEPTED,
    );
    expect(DEVICE_SMS.device_ready.template).toBe(SMS_TEMPLATES.DEVICE_READY);
    expect(DEVICE_SMS.device_delivered.template).toBe(
      SMS_TEMPLATES.DEVICE_DELIVERED,
    );
  });
});

describe("renderDeviceSms", () => {
  it("fills every placeholder in the rendered text", () => {
    const { text } = renderDeviceSms("device_ready", ordinary);

    expect(text).not.toMatch(/#[A-Z]+#/);
    expect(text).toContain("علی رضایی");
    expect(text).toContain("یخچال");
    expect(text).toContain("1042");
    expect(text).toContain("تعمیرگاه مرکزی");
  });

  it("replaces a slash rather than letting the send throw", () => {
    // sendTemplate refuses any value containing one, and «یخچال ال‌جی/سامسونگ»
    // is an ordinary thing for a shop to have typed months ago. Failing that
    // customer's message over it would be a bug nobody could explain.
    const { parameters } = renderDeviceSms("device_accepted", {
      ...ordinary,
      deviceName: "یخچال ال‌جی/سامسونگ",
    });

    expect(parameters.DEVICE).not.toContain("/");
  });

  it("flattens a newline in a value", () => {
    // A parameter is a value inside a line, not a line of its own.
    const { parameters } = renderDeviceSms("device_accepted", {
      ...ordinary,
      customerName: "علی\nرضایی",
    });

    expect(parameters.NAME).toBe("علی رضایی");
  });

  it("cuts to the cap without leaving a trailing space", () => {
    const { parameters } = renderDeviceSms("device_accepted", {
      ...ordinary,
      workspaceName: "تعمیرگاه " + "ی".repeat(40),
    });

    expect(parameters.SHOP.length).toBeLessThanOrEqual(PARAM_CAPS.SHOP);
    expect(parameters.SHOP).toBe(parameters.SHOP.trim());
  });

  it("never produces a value the provider would reject", () => {
    // The backstop for everything above, stated as the property that
    // actually matters rather than as three separate rules.
    const nasty = {
      customerName: "  ///  ",
      deviceName: "x".repeat(200),
      receptionNumber: 123456789,
      workspaceName: "\n\n",
    };

    for (const kind of KINDS) {
      for (const value of Object.values(renderDeviceSms(kind, nasty).parameters)) {
        expect(value.length).toBeGreaterThan(0);
        expect(value.length).toBeLessThanOrEqual(MAX_PARAMETER_CHARS);
        expect(value).not.toContain("/");
      }
    }
  });

  it("stands in for a value that is missing or only spaces", () => {
    // Customer.name is NOT NULL, but a shop can save a space. An empty
    // parameter is a message that reads «عزیز، دستگاه ... » with a hole in
    // it, and may be refused outright.
    const { parameters } = renderDeviceSms("device_delivered", {
      customerName: "   ",
      deviceName: null,
      receptionNumber: 7,
      workspaceName: null,
    });

    expect(parameters.NAME).toBe("مشتری");
    expect(parameters.DEVICE).toBe("دستگاه");
    expect(parameters.SHOP).toBe("تعمیرگاه");
  });
});
