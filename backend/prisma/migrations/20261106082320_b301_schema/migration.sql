-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'MANAGER', 'WORKER');

-- CreateEnum
CREATE TYPE "menu_item_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "unit" AS ENUM ('G', 'KG', 'ML', 'L', 'PCS');

-- CreateEnum
CREATE TYPE "inventory_item_type" AS ENUM ('RAW', 'READY', 'MIXED');

-- CreateEnum
CREATE TYPE "inventory_transaction_type" AS ENUM ('PURCHASE', 'CONSUMPTION', 'WASTE', 'TRANSFER', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "placed_by_type" AS ENUM ('STAFF', 'CUSTOMER', 'GUEST');

-- CreateEnum
CREATE TYPE "order_history_action" AS ENUM ('PLACED', 'ADVANCED', 'CANCELED');

-- AlterTable
ALTER TABLE "app_environment" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" "user_role" NOT NULL,
    "permission" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "branch_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "status" "menu_item_status" NOT NULL DEFAULT 'ACTIVE',
    "is_combo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_ingredients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "unit" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_item_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "inventory_item_type" NOT NULL,
    "unit" "unit" NOT NULL,
    "standard_unit_cost" DECIMAL(14,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_item_components" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "mixed_item_id" UUID NOT NULL,
    "component_item_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "unit" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_item_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_stock" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "current_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "low_stock_threshold" DECIMAL(14,3),
    "avg_unit_cost" DECIMAL(14,4),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branch_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "type" "inventory_transaction_type" NOT NULL,
    "quantity_delta" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4),
    "related_order_id" UUID,
    "actor_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "through_seq" BIGINT NOT NULL,
    "taken_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "counted_quantity" DECIMAL(14,3) NOT NULL,
    "expected_quantity" DECIMAL(14,3) NOT NULL,
    "gap" DECIMAL(14,3) NOT NULL,
    "adjustment_transaction_id" UUID,
    "snapshot_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reconciliation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" "unit" NOT NULL,
    "reason" TEXT NOT NULL,
    "transaction_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "waste_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_workflow_stages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "cancellable" BOOLEAN NOT NULL,
    "deducts_inventory" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_workflow_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "stage_key" TEXT NOT NULL,
    "canceled_at" TIMESTAMPTZ(3),
    "placed_by_type" "placed_by_type" NOT NULL,
    "placed_by_id" UUID,
    "total" DECIMAL(12,2) NOT NULL,
    "tracking_token_hash" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_stage_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "action" "order_history_action" NOT NULL,
    "from_stage_key" TEXT,
    "to_stage_key" TEXT,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_id_key" ON "branches"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_name_key" ON "branches"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "users_tenant_id_role_is_active_idx" ON "users"("tenant_id", "role", "is_active");

-- CreateIndex
CREATE INDEX "users_tenant_id_branch_id_idx" ON "users"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_id_key" ON "users"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_tenant_id_id_key" ON "role_permissions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_tenant_id_role_permission_key" ON "role_permissions"("tenant_id", "role", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_tenant_id_id_key" ON "user_permission_overrides"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_tenant_id_user_id_permission_key" ON "user_permission_overrides"("tenant_id", "user_id", "permission");

-- CreateIndex
CREATE INDEX "categories_tenant_id_is_active_position_idx" ON "categories"("tenant_id", "is_active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_id_key" ON "categories"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "menu_items_tenant_id_category_id_idx" ON "menu_items"("tenant_id", "category_id");

-- CreateIndex
CREATE INDEX "menu_items_tenant_id_status_branch_id_idx" ON "menu_items"("tenant_id", "status", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_tenant_id_id_key" ON "menu_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "menu_item_ingredients_tenant_id_inventory_item_id_idx" ON "menu_item_ingredients"("tenant_id", "inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_ingredients_tenant_id_id_key" ON "menu_item_ingredients"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_ingredients_tenant_id_menu_item_id_inventory_item_key" ON "menu_item_ingredients"("tenant_id", "menu_item_id", "inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_items_tenant_id_type_is_active_idx" ON "inventory_items"("tenant_id", "type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_tenant_id_id_key" ON "inventory_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_tenant_id_name_key" ON "inventory_items"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "inventory_item_components_tenant_id_component_item_id_idx" ON "inventory_item_components"("tenant_id", "component_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_components_tenant_id_id_key" ON "inventory_item_components"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_components_tenant_id_mixed_item_id_component_key" ON "inventory_item_components"("tenant_id", "mixed_item_id", "component_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_stock_tenant_id_id_key" ON "branch_stock"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_stock_tenant_id_branch_id_inventory_item_id_key" ON "branch_stock"("tenant_id", "branch_id", "inventory_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transactions_seq_key" ON "inventory_transactions"("seq");

-- CreateIndex
CREATE INDEX "inventory_transactions_item_seq_idx" ON "inventory_transactions"("tenant_id", "branch_id", "inventory_item_id", "seq");

-- CreateIndex
CREATE INDEX "inventory_transactions_item_time_idx" ON "inventory_transactions"("tenant_id", "branch_id", "inventory_item_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_tenant_id_branch_id_type_created_at_idx" ON "inventory_transactions"("tenant_id", "branch_id", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transactions_tenant_id_id_key" ON "inventory_transactions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transactions_related_order_id_inventory_item_id_t_key" ON "inventory_transactions"("related_order_id", "inventory_item_id", "type");

-- CreateIndex
CREATE INDEX "inventory_snapshots_tenant_id_branch_id_inventory_item_id_t_idx" ON "inventory_snapshots"("tenant_id", "branch_id", "inventory_item_id", "through_seq");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_snapshots_tenant_id_id_key" ON "inventory_snapshots"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "reconciliation_entries_item_time_idx" ON "reconciliation_entries"("tenant_id", "branch_id", "inventory_item_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_entries_tenant_id_id_key" ON "reconciliation_entries"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_entries_tenant_id_adjustment_transaction_id_key" ON "reconciliation_entries"("tenant_id", "adjustment_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_entries_tenant_id_snapshot_id_key" ON "reconciliation_entries"("tenant_id", "snapshot_id");

-- CreateIndex
CREATE INDEX "waste_entries_tenant_id_branch_id_created_at_idx" ON "waste_entries"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "waste_entries_tenant_id_branch_id_inventory_item_id_created_idx" ON "waste_entries"("tenant_id", "branch_id", "inventory_item_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "waste_entries_tenant_id_id_key" ON "waste_entries"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "waste_entries_tenant_id_transaction_id_key" ON "waste_entries"("tenant_id", "transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_workflow_stages_tenant_id_id_key" ON "order_workflow_stages"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "order_workflow_stages_tenant_id_key_key" ON "order_workflow_stages"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "order_workflow_stages_tenant_id_position_key" ON "order_workflow_stages"("tenant_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tracking_token_hash_key" ON "orders"("tracking_token_hash");

-- CreateIndex
CREATE INDEX "orders_tenant_id_branch_id_stage_key_created_at_idx" ON "orders"("tenant_id", "branch_id", "stage_key", "created_at");

-- CreateIndex
CREATE INDEX "orders_tenant_id_branch_id_updated_at_idx" ON "orders"("tenant_id", "branch_id", "updated_at");

-- CreateIndex
CREATE INDEX "orders_tenant_id_stage_key_idx" ON "orders"("tenant_id", "stage_key");

-- CreateIndex
CREATE INDEX "orders_tenant_id_branch_id_created_at_idx" ON "orders"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_id_id_key" ON "orders"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "order_items_tenant_id_order_id_idx" ON "order_items"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "order_items_tenant_id_menu_item_id_idx" ON "order_items"("tenant_id", "menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_tenant_id_id_key" ON "order_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "order_stage_history_tenant_id_order_id_created_at_idx" ON "order_stage_history"("tenant_id", "order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_stage_history_tenant_id_id_key" ON "order_stage_history"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_tenant_id_menu_item_id_fkey" FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "menu_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_tenant_id_inventory_item_id_fkey" FOREIGN KEY ("tenant_id", "inventory_item_id") REFERENCES "inventory_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_item_components" ADD CONSTRAINT "inventory_item_components_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_item_components" ADD CONSTRAINT "inventory_item_components_tenant_id_mixed_item_id_fkey" FOREIGN KEY ("tenant_id", "mixed_item_id") REFERENCES "inventory_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_item_components" ADD CONSTRAINT "inventory_item_components_tenant_id_component_item_id_fkey" FOREIGN KEY ("tenant_id", "component_item_id") REFERENCES "inventory_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_tenant_id_inventory_item_id_fkey" FOREIGN KEY ("tenant_id", "inventory_item_id") REFERENCES "inventory_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_inventory_item_id_fkey" FOREIGN KEY ("tenant_id", "inventory_item_id") REFERENCES "inventory_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_related_order_id_fkey" FOREIGN KEY ("tenant_id", "related_order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_actor_id_fkey" FOREIGN KEY ("tenant_id", "actor_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_tenant_id_inventory_item_id_fkey" FOREIGN KEY ("tenant_id", "inventory_item_id") REFERENCES "inventory_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_tenant_id_inventory_item_id_fkey" FOREIGN KEY ("tenant_id", "inventory_item_id") REFERENCES "inventory_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_tenant_id_adjustment_transaction_id_fkey" FOREIGN KEY ("tenant_id", "adjustment_transaction_id") REFERENCES "inventory_transactions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_tenant_id_snapshot_id_fkey" FOREIGN KEY ("tenant_id", "snapshot_id") REFERENCES "inventory_snapshots"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_tenant_id_actor_id_fkey" FOREIGN KEY ("tenant_id", "actor_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_tenant_id_inventory_item_id_fkey" FOREIGN KEY ("tenant_id", "inventory_item_id") REFERENCES "inventory_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_tenant_id_transaction_id_fkey" FOREIGN KEY ("tenant_id", "transaction_id") REFERENCES "inventory_transactions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_tenant_id_actor_id_fkey" FOREIGN KEY ("tenant_id", "actor_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_workflow_stages" ADD CONSTRAINT "order_workflow_stages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_branch_id_fkey" FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_stage_key_fkey" FOREIGN KEY ("tenant_id", "stage_key") REFERENCES "order_workflow_stages"("tenant_id", "key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_menu_item_id_fkey" FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "menu_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_stage_history" ADD CONSTRAINT "order_stage_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_stage_history" ADD CONSTRAINT "order_stage_history_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "order_stage_history" ADD CONSTRAINT "order_stage_history_tenant_id_actor_id_fkey" FOREIGN KEY ("tenant_id", "actor_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── CHECK constraints, added by hand (Prisma cannot express them; ARCHITECTURE §4) ───
-- B301 migration, created with `npx prisma migrate dev --create-only --name b301_schema`

-- Tenancy & people
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "users" ADD CONSTRAINT "users_branch_required_unless_admin" CHECK ("role" = 'ADMIN' OR "branch_id" IS NOT NULL);

-- Catalog
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_no_combos_in_phase_1" CHECK ("is_combo" = false);
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_quantity_positive" CHECK ("quantity" > 0);

-- Inventory
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_standard_unit_cost_non_negative" CHECK ("standard_unit_cost" IS NULL OR "standard_unit_cost" >= 0);
ALTER TABLE "inventory_item_components" ADD CONSTRAINT "inventory_item_components_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "inventory_item_components" ADD CONSTRAINT "inventory_item_components_not_self" CHECK ("mixed_item_id" <> "component_item_id");
-- branch_stock.current_stock may be negative (ADR 0006): no CHECK on it.
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_low_stock_threshold_non_negative" CHECK ("low_stock_threshold" IS NULL OR "low_stock_threshold" >= 0);
ALTER TABLE "branch_stock" ADD CONSTRAINT "branch_stock_avg_unit_cost_non_negative" CHECK ("avg_unit_cost" IS NULL OR "avg_unit_cost" >= 0);
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_delta_non_zero" CHECK ("quantity_delta" <> 0);
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_unit_cost_non_negative" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_purchase_adds" CHECK ("type" <> 'PURCHASE' OR "quantity_delta" > 0);
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_consumption_waste_remove" CHECK ("type" NOT IN ('CONSUMPTION', 'WASTE') OR "quantity_delta" < 0);
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_order_only_for_consumption" CHECK ("related_order_id" IS NULL OR "type" = 'CONSUMPTION');
-- Without an order, a CONSUMPTION row would escape the idempotency key (NULLs never collide).
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_consumption_needs_order" CHECK ("type" <> 'CONSUMPTION' OR "related_order_id" IS NOT NULL);
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_through_seq_non_negative" CHECK ("through_seq" >= 0);
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_counted_non_negative" CHECK ("counted_quantity" >= 0);
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_gap_is_difference" CHECK ("gap" = "counted_quantity" - "expected_quantity");
ALTER TABLE "reconciliation_entries" ADD CONSTRAINT "reconciliation_entries_adjustment_iff_gap" CHECK (("gap" = 0) = ("adjustment_transaction_id" IS NULL));
ALTER TABLE "waste_entries" ADD CONSTRAINT "waste_entries_quantity_positive" CHECK ("quantity" > 0);

-- Orders
ALTER TABLE "order_workflow_stages" ADD CONSTRAINT "order_workflow_stages_key_format" CHECK ("key" ~ '^[a-z][a-z0-9-]*$');
ALTER TABLE "order_workflow_stages" ADD CONSTRAINT "order_workflow_stages_position_positive" CHECK ("position" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_non_negative" CHECK ("total" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_has_no_placer" CHECK (("placed_by_type" = 'GUEST') = ("placed_by_id" IS NULL));
-- A guest can only track or cancel through the token (ADR 0008).
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_has_tracking_token" CHECK ("placed_by_type" <> 'GUEST' OR "tracking_token_hash" IS NOT NULL);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unit_price" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_is_product" CHECK ("line_total" = "unit_price" * "quantity");
ALTER TABLE "order_stage_history" ADD CONSTRAINT "order_stage_history_advance_has_stages" CHECK ("action" <> 'ADVANCED' OR ("from_stage_key" IS NOT NULL AND "to_stage_key" IS NOT NULL));
ALTER TABLE "order_stage_history" ADD CONSTRAINT "order_stage_history_placed_has_stage" CHECK ("action" <> 'PLACED' OR ("from_stage_key" IS NULL AND "to_stage_key" IS NOT NULL));
ALTER TABLE "order_stage_history" ADD CONSTRAINT "order_stage_history_canceled_has_stage" CHECK ("action" <> 'CANCELED' OR ("from_stage_key" IS NOT NULL AND "to_stage_key" IS NULL));
