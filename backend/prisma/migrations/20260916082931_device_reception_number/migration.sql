-- Reception numbers: what a shop calls a device, as opposed to what the
-- database calls it.
--
-- devices.id is a surrogate key drawn from a sequence shared by every
-- workspace. Until now it also stood in as the reception number — printed on
-- the intake slip, read back over the phone, and sent as #NUMBER# in every
-- customer notification. That made the numbers a shop sees depend on how
-- many devices every *other* shop had taken in: the first device of a new
-- workshop could be numbered 4,812, and no two shops could ever both have a
-- device «۱».
--
-- The fix follows 2.8 exactly, which solved the same problem for invoice
-- numbers: a counter on the workspace row, incremented with `seq = seq + 1`
-- inside the writing transaction so it takes a row lock and two concurrent
-- callers cannot receive the same number.
--
-- Three steps, and the order matters: a NOT NULL column cannot be added to a
-- table that already has rows without giving those rows a value first.

-- 1. The counter, beside purchase_seq / sale_seq / repair_seq.
ALTER TABLE "workspaces" ADD COLUMN "device_seq" INTEGER NOT NULL DEFAULT 0;

-- 2. The column, nullable for the moment.
ALTER TABLE "devices" ADD COLUMN "reception_number" INTEGER;

-- 3. Number the devices that already exist, per workspace, oldest first.
--
-- Ordered by id rather than entry_date: id is never null and never ties,
-- and it is the order in which the devices were actually taken in. Two
-- devices accepted on the same day would otherwise be numbered arbitrarily.
UPDATE "devices" AS d
SET "reception_number" = numbered.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY id) AS rn
  FROM "devices"
) AS numbered
WHERE d.id = numbered.id;

-- 4. Move each workspace's counter past what was just handed out, so the
--    next device continues the series rather than colliding with it.
--
-- COUNT(*) is correct here and only here: the numbers were just assigned as
-- a dense 1..n series per workspace, so the count and the highest number are
-- the same figure. Every later increment goes through the counter itself.
UPDATE "workspaces" AS w
SET "device_seq" = counted.n
FROM (
  SELECT workspace_id, COUNT(*)::int AS n
  FROM "devices"
  GROUP BY workspace_id
) AS counted
WHERE w.id = counted.workspace_id;

-- 5. Now that every row has one, require it.
ALTER TABLE "devices" ALTER COLUMN "reception_number" SET NOT NULL;

-- 6. The rule itself, held by the database rather than by whichever
--    controller writes next: one number per shop, ever.
CREATE UNIQUE INDEX "devices_workspace_id_reception_number_key"
  ON "devices"("workspace_id", "reception_number");
