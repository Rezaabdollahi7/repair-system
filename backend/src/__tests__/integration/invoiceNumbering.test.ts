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

/** A purchase invoice for one unit of the given item, through the API. */
function createInvoice(token: string, itemId: number) {
  return request(app)
    .post("/api/purchase-invoices")
    .set("Authorization", `Bearer ${token}`)
    .send({
      supplier_name: "تأمین‌کننده",
      paid_amount: 1000,
      note: null,
      items: [{ item_id: itemId, quantity: 1, unit_price: 1000 }],
    });
}

async function seedItem(workspaceId: number) {
  const row = await owner.item.create({
    data: { workspaceId, name: "خازن", code: "C-100" },
    select: { id: true },
  });
  return row.id;
}

describe("invoice numbering", () => {
  it("increments the workspace counter through the API", async () => {
    // The counter lives on the workspaces row, which has its own RLS policy
    // and which the application role may update but not insert or delete.
    // Nothing until now exercised that path against a real database.
    const itemId = await seedItem(workspaces.a.workspaceId);

    const first = await createInvoice(workspaces.a.token, itemId);
    const second = await createInvoice(workspaces.a.token, itemId);

    expect(first.status).toBe(201);
    expect(first.body.invoice_number).toBe("PUR-0001");
    expect(second.body.invoice_number).toBe("PUR-0002");
  });

  it("keeps each workspace's numbering independent", async () => {
    const itemA = await seedItem(workspaces.a.workspaceId);
    const itemB = await seedItem(workspaces.b.workspaceId);

    await createInvoice(workspaces.a.token, itemA);
    await createInvoice(workspaces.a.token, itemA);
    const firstForB = await createInvoice(workspaces.b.token, itemB);

    // One workshop's activity must not advance another's counter, or the
    // second shop's books open at an arbitrary number.
    expect(firstForB.body.invoice_number).toBe("PUR-0001");
  });

  it("gives every concurrent request a different number", async () => {
    // The reason this task exists. "Count today's invoices and add one" let
    // two requests read the same value before either wrote; the unique
    // constraint then turned the loser into a failed save. `seq = seq + 1`
    // takes a row lock, so the numbers come out distinct instead.
    const itemId = await seedItem(workspaces.a.workspaceId);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        createInvoice(workspaces.a.token, itemId),
      ),
    );

    expect(responses.every((res) => res.status === 201)).toBe(true);

    const numbers = responses.map((res) => res.body.invoice_number);
    expect(new Set(numbers).size).toBe(10);

    // Sequential and gap-free, not merely distinct: a gap would mean a
    // number was handed out and lost, which is what accounting notices.
    expect([...numbers].sort()).toEqual([
      "PUR-0001",
      "PUR-0002",
      "PUR-0003",
      "PUR-0004",
      "PUR-0005",
      "PUR-0006",
      "PUR-0007",
      "PUR-0008",
      "PUR-0009",
      "PUR-0010",
    ]);
  });
});
