import request from "supertest";
import app from "../../app";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// settings.currency_unit: which unit a workshop reads money in. Display
// only — amounts stay in rials — so what is tested here is that the choice
// is kept, kept per workshop, and kept to the two values.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  // A real workshop gets its settings row at sign-up (populateWorkspace);
  // the seed does not write one.
  for (const { workspaceId } of [workspaces.a, workspaces.b]) {
    await owner.settings.create({ data: { workspaceId } });
  }
});

afterAll(async () => {
  await disconnectOwner();
});

function as(token: string, method: "get" | "put", path: string) {
  return request(app)[method](path).set("Authorization", `Bearer ${token}`);
}

describe("settings.currency_unit", () => {
  it("starts at toman", async () => {
    const res = await as(workspaces.a.token, "get", "/api/settings");

    expect(res.status).toBe(200);
    expect(res.body.currency_unit).toBe("toman");
  });

  it("is kept for the workshop that chose it and no other", async () => {
    const put = await as(workspaces.a.token, "put", "/api/settings").send({
      currency_unit: "rial",
    });
    expect(put.status).toBe(200);
    expect(put.body.currency_unit).toBe("rial");

    const mine = await as(workspaces.a.token, "get", "/api/settings");
    const theirs = await as(workspaces.b.token, "get", "/api/settings");
    expect(mine.body.currency_unit).toBe("rial");
    expect(theirs.body.currency_unit).toBe("toman");
  });

  it("refuses a unit that is neither", async () => {
    const res = await as(workspaces.a.token, "put", "/api/settings").send({
      currency_unit: "dollar",
    });

    expect(res.status).toBe(400);
  });

  it("is held to the two values by the database too", async () => {
    await expect(
      owner.settings.update({
        where: { workspaceId: workspaces.a.workspaceId },
        data: { currencyUnit: "dinar" },
      }),
    ).rejects.toThrow(/settings_currency_unit_check/);
  });
});
