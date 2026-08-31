-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "discount_code_id" INTEGER;

-- CreateIndex
CREATE INDEX "payments_discount_code_id_idx" ON "payments"("discount_code_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
