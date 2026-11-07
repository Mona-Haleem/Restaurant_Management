-- CreateIndex
CREATE INDEX "order_stage_history_tenant_id_to_stage_key_created_at_idx" ON "order_stage_history"("tenant_id", "to_stage_key", "created_at");
