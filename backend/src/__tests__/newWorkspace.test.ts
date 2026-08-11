import bcrypt from "bcryptjs";
import { DEFAULT_SERVICES, populateWorkspace } from "../utils/newWorkspace";
import type { Prisma } from "../generated/prisma/client";

const WORKSPACE_ID = 7;

const input = {
  workspaceName: "تعمیرگاه رضا",
  username: "09123456789",
  password: "testpass123",
};

function mockTx() {
  return {
    role: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1 }) },
    user: { create: jest.fn().mockResolvedValue({ id: 9 }) },
    settings: { create: jest.fn().mockResolvedValue({ id: 2 }) },
    service: { createMany: jest.fn().mockResolvedValue({ count: 4 }) },
  };
}

type MockTx = ReturnType<typeof mockTx>;

function run(tx: MockTx) {
  return populateWorkspace(
    tx as unknown as Prisma.TransactionClient,
    WORKSPACE_ID,
    input,
  );
}

describe("populateWorkspace", () => {
  it("makes the owner a super admin of the new workspace", async () => {
    const tx = mockTx();
    await run(tx);

    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      username: input.username,
      roleId: 1,
    });
  });

  it("stores the password hashed, never in the clear", async () => {
    const tx = mockTx();
    await run(tx);

    const stored = tx.user.create.mock.calls[0][0].data.password;
    expect(stored).not.toBe(input.password);
    expect(await bcrypt.compare(input.password, stored)).toBe(true);
  });

  it("names the owner with a placeholder rather than the shop", async () => {
    const tx = mockTx();
    await run(tx);

    // Sign-up asks for a phone, a password and a shop name — not a person's
    // name. Using the shop's would leave a row in the personnel list that
    // reads as a human being.
    expect(tx.user.create.mock.calls[0][0].data.fullName).toBe("مدیر");
  });

  it("creates the settings row the settings page assumes exists", async () => {
    const tx = mockTx();
    await run(tx);

    // updateSettings does a bare update(), so without this the first time an
    // owner saved their settings would fail.
    expect(tx.settings.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      companyName: input.workspaceName,
    });
  });

  it("seeds the default services, all scoped to the new workspace", async () => {
    const tx = mockTx();
    await run(tx);

    const created = tx.service.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(DEFAULT_SERVICES.length);
    expect(
      created.every(
        (service: { workspaceId: number }) =>
          service.workspaceId === WORKSPACE_ID,
      ),
    ).toBe(true);
  });

  it("reads the role rather than creating one", async () => {
    const tx = mockTx();
    await run(tx);

    // The three roles are reference data shared by every workspace, seeded
    // once and carrying no workspaceId.
    expect(tx.role.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { name: "super_admin" },
      select: { id: true },
    });
  });
});
