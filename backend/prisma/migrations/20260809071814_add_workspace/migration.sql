-- CreateEnum
CREATE TYPE "workspace_status" AS ENUM ('trial', 'active', 'expired');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "status" "workspace_status" NOT NULL DEFAULT 'trial',
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspaces_status_idx" ON "workspaces"("status");
