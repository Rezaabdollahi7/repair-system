import request from "supertest";
import app from "../../app";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// GET /api/items/units: the units a shop has used, for the unit picker.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
});

function api(method: "get" | "post", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

describe("GET /api/items/units", () => {
  it("lists each unit the shop has used once, its own and no other shop's", async () => {
    for (const [code, unit] of [
      ["A", "عدد"],
      ["B", "حلقه"],
      ["C", "حلقه"],
      ["D", "شاخه"],
    ]) {
      const res = await api("post", "/api/items").send({
        code,
        name: `کالا ${code}`,
        unit,
      });
      expect(res.status).toBe(201);
    }
    await owner.item.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        code: "X",
        name: "مال ب",
        unit: "بشکه",
      },
    });

    const res = await api("get", "/api/items/units");

    expect(res.status).toBe(200);
    expect([...res.body].sort()).toEqual(["حلقه", "شاخه", "عدد"].sort());
  });

  it("refuses a unit longer than twenty characters", async () => {
    const res = await api("post", "/api/items").send({
      code: "LONG",
      name: "کالا",
      unit: "واحدی با نامی بسیار بسیار طولانی",
    });

    expect(res.status).toBe(400);
  });
});
