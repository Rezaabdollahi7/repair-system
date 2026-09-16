import request from "supertest";
import app from "../../app";
import prisma from "../../lib/prisma";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

/** Takes in a device through the API, the way the intake form does. */
function createDevice(token: string, deviceName = "یخچال") {
  return request(app)
    .post("/api/devices")
    .set("Authorization", `Bearer ${token}`)
    .send({ device_name: deviceName, status: "pending" });
}

describe("reception numbering", () => {
  it("numbers a workshop's devices from one, through the API", async () => {
    const first = await createDevice(workspaces.a.token);
    const second = await createDevice(workspaces.a.token);

    expect(first.status).toBe(201);
    expect(first.body.reception_number).toBe(1);
    expect(second.body.reception_number).toBe(2);
  });

  it("does not let one workshop's activity number another's devices", async () => {
    // The failure this task exists to fix, reproduced: three devices taken
    // in by one shop, then the first device of another. Before 2.9 that
    // device was numbered 4 — the next value of a sequence shared by the
    // whole platform — and the shop's very first intake slip read «۴».
    //
    // The primary key still does exactly that, which is correct: it is a
    // platform-wide identifier. What must not follow it is the number the
    // customer is given.
    await createDevice(workspaces.a.token);
    await createDevice(workspaces.a.token);
    await createDevice(workspaces.a.token);

    const firstForB = await createDevice(workspaces.b.token);

    expect(firstForB.body.reception_number).toBe(1);
    expect(firstForB.body.id).toBe(4);
  });

  it("lets two workshops both have a device number one", async () => {
    // Impossible before 2.9: devices.id comes from a sequence shared by the
    // whole platform, so the second shop's first device took whatever number
    // the first shop's activity had left. A workshop's numbering must depend
    // on its own history and nothing else.
    const forA = await createDevice(workspaces.a.token, "یخچال الف");
    const forB = await createDevice(workspaces.b.token, "یخچال ب");

    expect(forA.body.reception_number).toBe(1);
    expect(forB.body.reception_number).toBe(1);
    // Different rows, same number — which the unique index permits precisely
    // because it is scoped to the workspace.
    expect(forA.body.id).not.toBe(forB.body.id);
  });

  it("gives every concurrent intake a different number", async () => {
    // The guarantee no mocked test can reach. Two staff taking in devices at
    // the same moment used to be safe only because the number came from the
    // sequence; now it comes from a counter, and what keeps them apart is
    // the row lock `seq = seq + 1` takes. A read-then-write in JavaScript
    // would hand both callers the same number and the unique index would
    // turn one of them into a failed intake.
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => createDevice(workspaces.a.token)),
    );

    expect(responses.every((res) => res.status === 201)).toBe(true);

    const numbers = responses.map((res) => res.body.reception_number);
    expect(new Set(numbers).size).toBe(10);

    // Sequential and gap-free, not merely distinct: a gap means a number was
    // drawn and lost, and a shop reads its slips as a continuous series.
    expect([...numbers].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("returns the number when the intake fails", async () => {
    // Why the create is in a transaction. The counter moves first; if the
    // insert then fails, the rollback has to take the counter back with it,
    // or the next device skips a number nobody can account for.
    await createDevice(workspaces.a.token);

    const rejected = await request(app)
      .post("/api/devices")
      .set("Authorization", `Bearer ${workspaces.a.token}`)
      // A customer that does not exist: the foreign key fails after the
      // number has already been drawn.
      .send({ device_name: "یخچال", status: "pending", customer_id: 999_999 });

    expect(rejected.status).toBeGreaterThanOrEqual(400);

    const next = await createDevice(workspaces.a.token);
    expect(next.body.reception_number).toBe(2);

    const workspace = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
      select: { deviceSeq: true },
    });
    expect(workspace.deviceSeq).toBe(2);
  });
});
