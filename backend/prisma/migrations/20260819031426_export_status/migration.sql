-- AlterTable
ALTER TABLE "backups" ADD COLUMN     "error" TEXT,
ADD COLUMN     "filepath" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';
