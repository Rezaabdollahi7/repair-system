-- CreateEnum
CREATE TYPE "inventory_transaction_type" AS ENUM ('purchase', 'sale', 'adjustment');

-- CreateEnum
CREATE TYPE "repair_invoice_status" AS ENUM ('draft', 'issued', 'paid', 'cancelled');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,x

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "full_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "role_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER,
    "personnel_id" INTEGER,
    "device_name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serial_number" TEXT,
    "entry_date" TIMESTAMP(3),
    "exit_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'received',
    "description" TEXT,
    "needs_invoice" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_images" (
    "id" SERIAL NOT NULL,
    "device_id" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_assignments" (
    "id" SERIAL NOT NULL,
    "device_id" INTEGER NOT NULL,
    "personnel_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" INTEGER,

    CONSTRAINT "device_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'عدد',
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "avg_purchase_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sell_price" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "type" "inventory_transaction_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "reference_id" INTEGER,
    "reference_type" TEXT,
    "note" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "supplier_name" TEXT,
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_items" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,0) NOT NULL,
    "total_price" DECIMAL(18,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "customer_id" INTEGER,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "device_id" INTEGER,
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_invoice_items" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "name" TEXT,
    "unit" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,0) NOT NULL,
    "discount_type" TEXT,
    "discount_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(18,0) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_price" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'خدمت',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "device_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "invoice_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "status" "repair_invoice_status" NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "discount_type" TEXT,
    "discount_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "warranty_months" INTEGER NOT NULL DEFAULT 0,
    "warranty_until" TIMESTAMP(3),
    "technician_id" INTEGER,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_invoice_items" (
    "id" SERIAL NOT NULL,x
    "invoice_id" INTEGER NOT NULL,
    "item_type" TEXT NOT NULL,
    "item_id" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit" TEXT,
    "unit_price" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "discount_type" TEXT,
    "discount_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "total_price" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_invoice_payments" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'cash',
    "reference_number" TEXT,
    "note" TEXT,
    "payment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "company_name" TEXT,
    "company_address" TEXT,
    "company_phone" TEXT,
    "company_email" TEXT,
    "company_website" TEXT,
    "company_logo" TEXT,
    "stamp_image" TEXT,
    "signature_image" TEXT,
    "default_tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "default_warranty_months" INTEGER NOT NULL DEFAULT 3,
    "invoice_prefix" TEXT NOT NULL DEFAULT 'INV-',
    "invoice_footer_text" TEXT,
    "sale_invoice_paper_size" TEXT NOT NULL DEFAULT 'A5',
    "sale_invoice_show_logo" BOOLEAN NOT NULL DEFAULT true,
    "sale_invoice_show_company_info" BOOLEAN NOT NULL DEFAULT true,
    "sale_invoice_show_email" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_show_website" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_show_device_info" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_show_customer_phone" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_show_discount" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_show_tax" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_show_stamp" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_show_signature" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_show_warranty" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_show_technician" BOOLEAN NOT NULL DEFAULT false,
    "sale_invoice_header_text" TEXT,
    "sale_invoice_footer_text" TEXT DEFAULT 'با تشکر از اعتماد شما',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backups" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "includes_uploads" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "devices_customer_id_idx" ON "devices"("customer_id");

-- CreateIndex
CREATE INDEX "devices_personnel_id_idx" ON "devices"("personnel_id");

-- CreateIndex
CREATE INDEX "devices_status_idx" ON "devices"("status");

-- CreateIndex
CREATE INDEX "device_images_device_id_idx" ON "device_images"("device_id");

-- CreateIndex
CREATE INDEX "device_assignments_personnel_id_idx" ON "device_assignments"("personnel_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_assignments_device_id_personnel_id_key" ON "device_assignments"("device_id", "personnel_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");

-- CreateIndex
CREATE INDEX "items_category_id_idx" ON "items"("category_id");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE INDEX "inventory_transactions_item_id_idx" ON "inventory_transactions"("item_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_created_by_idx" ON "inventory_transactions"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_invoice_number_key" ON "purchase_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "purchase_invoices_invoice_date_idx" ON "purchase_invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "purchase_invoices_created_by_idx" ON "purchase_invoices"("created_by");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_invoice_id_idx" ON "purchase_invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "purchase_invoice_items_item_id_idx" ON "purchase_invoice_items"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_invoices_invoice_number_key" ON "sale_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "sale_invoices_invoice_date_idx" ON "sale_invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "sale_invoices_customer_id_idx" ON "sale_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "sale_invoices_device_id_idx" ON "sale_invoices"("device_id");

-- CreateIndex
CREATE INDEX "sale_invoices_created_by_idx" ON "sale_invoices"("created_by");

-- CreateIndex
CREATE INDEX "sale_invoice_items_invoice_id_idx" ON "sale_invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "sale_invoice_items_item_id_idx" ON "sale_invoice_items"("item_id");

-- CreateIndex
CREATE INDEX "services_is_active_sort_order_idx" ON "services"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "repair_invoices_invoice_number_key" ON "repair_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "repair_invoices_device_id_idx" ON "repair_invoices"("device_id");

-- CreateIndex
CREATE INDEX "repair_invoices_status_idx" ON "repair_invoices"("status");

-- CreateIndex
CREATE INDEX "repair_invoices_invoice_date_idx" ON "repair_invoices"("invoice_date");

-- CreateIndex
CREATE INDEX "repair_invoices_customer_id_idx" ON "repair_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "repair_invoices_technician_id_idx" ON "repair_invoices"("technician_id");

-- CreateIndex
CREATE INDEX "repair_invoices_created_by_idx" ON "repair_invoices"("created_by");

-- CreateIndex
CREATE INDEX "repair_invoice_items_invoice_id_idx" ON "repair_invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "repair_invoice_payments_invoice_id_idx" ON "repair_invoice_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "repair_invoice_payments_created_by_idx" ON "repair_invoice_payments"("created_by");

-- CreateIndex
CREATE INDEX "backups_created_by_idx" ON "backups"("created_by");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_images" ADD CONSTRAINT "device_images_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_personnel_id_fkey" FOREIGN KEY ("personnel_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_assignments" ADD CONSTRAINT "device_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoice_items" ADD CONSTRAINT "sale_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sale_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_invoice_items" ADD CONSTRAINT "sale_invoice_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_invoices" ADD CONSTRAINT "repair_invoices_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_invoices" ADD CONSTRAINT "repair_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_invoices" ADD CONSTRAINT "repair_invoices_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_invoices" ADD CONSTRAINT "repair_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_invoice_items" ADD CONSTRAINT "repair_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "repair_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_invoice_payments" ADD CONSTRAINT "repair_invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "repair_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_invoice_payments" ADD CONSTRAINT "repair_invoice_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
