import { verdictFor } from "../utils/subscriptionSchedule";
import { DELETION_DAYS, GRACE_DAYS } from "../utils/subscription";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-15T02:00:00.000Z");

/** A workspace whose subscription ended `elapsed` days ago. */
function expiredBy(elapsed: number) {
  return {
    neverExpires: false,
    expiresAt: new Date(NOW.getTime() - elapsed * DAY),
  };
}

describe("verdictFor", () => {
  it("says nothing while there is plenty of time left", () => {
    expect(verdictFor(expiredBy(-20), NOW)).toEqual({
      notify: null,
      status: "active",
      deleteData: false,
    });
  });

  it("warns a week out", () => {
    const verdict = verdictFor(expiredBy(-7), NOW);

    expect(verdict.notify).toMatchObject({ kind: "before_expiry_7", days: 7 });
    expect(verdict.status).toBe("active");
  });

  it("warns again on the last day", () => {
    expect(verdictFor(expiredBy(-1), NOW).notify).toMatchObject({
      kind: "before_expiry_1",
      days: 1,
    });
  });

  it("says nothing on the days in between", () => {
    for (const remaining of [6, 5, 4, 3, 2]) {
      expect(verdictFor(expiredBy(-remaining), NOW).notify).toBeNull();
    }
  });

  it("tells them the day it runs out, with the grace days filled in", () => {
    const verdict = verdictFor(expiredBy(0), NOW);

    expect(verdict.notify).toMatchObject({
      kind: "on_expiry",
      // ⚠️ The days matter, not just the kind. This test asserted only the
      // kind until 7 September, and toMatchObject ignores what it is not
      // told about — so the day the template's #DAYS# went unfilled, every
      // test stayed green and a customer received "تا #DAYS# روز".
      days: GRACE_DAYS,
    });
    expect(verdict.status).toBe("expired");
    expect(verdict.deleteData).toBe(false);
  });

  it("tells them again the day writes stop", () => {
    // The same day the read-only guard starts refusing, not a day either
    // side: a shop that discovers it by being unable to save thinks the app
    // is broken.
    const verdict = verdictFor(expiredBy(GRACE_DAYS), NOW);

    expect(verdict.notify).toMatchObject({
      kind: "after_expiry_3",
      days: DELETION_DAYS - GRACE_DAYS,
    });
  });

  it("gives a last warning a week before the data goes", () => {
    expect(verdictFor(expiredBy(DELETION_DAYS - 7), NOW).notify).toMatchObject({
      kind: "after_expiry_23",
      days: 7,
    });
  });

  it("asks for deletion once the thirty days are up, and sends nothing", () => {
    const verdict = verdictFor(expiredBy(DELETION_DAYS), NOW);

    expect(verdict.deleteData).toBe(true);
    // Nothing to announce: the message a week ago said this would happen.
    expect(verdict.notify).toBeNull();
  });

  it("still asks for deletion long afterwards", () => {
    // A workspace the job never reached — a server that was down for a
    // fortnight — must not be skipped for having gone past its day.
    expect(verdictFor(expiredBy(400), NOW).deleteData).toBe(true);
  });

  it("leaves a workspace flagged never-expire completely alone", () => {
    const verdict = verdictFor(
      { neverExpires: true, expiresAt: new Date(NOW.getTime() - 900 * DAY) },
      NOW,
    );

    expect(verdict).toEqual({
      notify: null,
      status: "active",
      deleteData: false,
    });
  });

  it("does not delete the data of a workspace with no expiry at all", () => {
    // The read-only guard reads a null expiry as expired, which is the safe
    // half. Deleting on it would be the unsafe half of the same reading.
    const verdict = verdictFor({ neverExpires: false, expiresAt: null }, NOW);

    expect(verdict.deleteData).toBe(false);
    expect(verdict.notify).toBeNull();
  });

  it("is stable across the hours of one day", () => {
    // The ledger is keyed on the kind and the expiry, so a job that ran
    // twice in a night must reach the same verdict both times.
    const early = new Date("2026-09-15T00:30:00.000Z");
    const late = new Date("2026-09-15T23:30:00.000Z");
    const workspace = {
      neverExpires: false,
      expiresAt: new Date("2026-09-08T02:00:00.000Z"),
    };

    expect(verdictFor(workspace, early).notify?.kind).toBe(
      verdictFor(workspace, late).notify?.kind,
    );
  });

  it("never sends a message with an unfilled parameter", () => {
    // The guard that debt 43 needed. sendTemplate validates slashes and
    // length but has no idea which parameters a template declares, so a
    // missing #DAYS# is delivered as the literal text — HTTP 200, status 1,
    // nothing in any log. The only thing that caught it was reading an SMS
    // on a phone.
    //
    // Every template approved in the sms.ir panel today carries #DAYS#. If
    // one is ever added that does not, this test has to be widened
    // deliberately rather than a message going out broken.
    const everyDay = [-400, -8, -7, -6, -2, -1, 0, 1, 3, 10, 23, 29];

    for (const elapsed of everyDay) {
      const verdict = verdictFor(expiredBy(elapsed), NOW);

      if (verdict.notify === null) {
        continue;
      }

      expect(verdict.notify.days).toEqual(expect.any(Number));
    }
  });
  
});
