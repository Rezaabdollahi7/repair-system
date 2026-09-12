import { transitionNotification } from "../utils/customerNotification";

// The rule on its own, apart from the controller that applies it.
// deviceController.test.ts checks that the handler asks this question at the
// right moment; this checks what the answer is.

describe("transitionNotification", () => {
  it("answers for the two statuses a customer is told about", () => {
    expect(transitionNotification("repairing", "ready_for_pickup")).toBe(
      "device_ready",
    );
    expect(transitionNotification("ready_for_pickup", "delivered")).toBe(
      "device_delivered",
    );
  });

  it("answers nothing when the status did not move", () => {
    // §10, and the whole reason this takes two arguments. Deciding from the
    // new value alone would text the customer on every edit of a device that
    // is already ready.
    for (const status of ["ready_for_pickup", "delivered", "repairing"]) {
      expect(transitionNotification(status, status)).toBeNull();
    }
  });

  it("says nothing about repaired, which is not ready", () => {
    // A repaired device is one the bench has finished with. It has not been
    // checked or priced, and inviting the customer to collect it is how a
    // shop ends up with somebody standing at the counter for nothing.
    expect(transitionNotification("repairing", "repaired")).toBeNull();
  });

  it("says nothing about the outcomes that are not deliveries", () => {
    for (const status of ["unrepairable", "not_repaired", "diagnosing", "waiting_for_parts"]) {
      expect(transitionNotification("repairing", status)).toBeNull();
    }
  });

  it("answers on the way back too, since a move is a move", () => {
    // A device returned to the shop and made ready again is a second real
    // event, and the customer should hear about it the second time.
    expect(transitionNotification("delivered", "ready_for_pickup")).toBe(
      "device_ready",
    );
  });

  it("says nothing about a status this build has never heard of", () => {
    // `received` is the schema default and appears in none of the frontend's
    // maps (10.9); a tenth status added later lands here too. Silence is the
    // right answer until somebody decides otherwise — the alternative is a
    // message chosen by accident.
    expect(transitionNotification("pending", "received")).toBeNull();
    expect(transitionNotification("pending", "something_new")).toBeNull();
  });
});
