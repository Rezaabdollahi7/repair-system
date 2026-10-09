-- The shop's private note about a customer. Nullable, no default: an empty
-- note and no note are the same thing, and NULL says so without a sentinel.
--
-- No RLS work here: `customers` already has its `workspace_isolation` policy
-- from the phase-2 migration, and adding a column to a table that is already
-- protected does not create a new hole. A *new* table would need both.
ALTER TABLE "customers" ADD COLUMN "notes" TEXT;
