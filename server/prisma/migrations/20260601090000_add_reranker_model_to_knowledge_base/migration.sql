ALTER TABLE "knowledge_bases"
  ADD COLUMN "reranker_model_id" UUID;

CREATE INDEX "knowledge_bases_reranker_model_id_idx"
  ON "knowledge_bases"("reranker_model_id");

ALTER TABLE "knowledge_bases"
  ADD CONSTRAINT "knowledge_bases_reranker_model_id_fkey"
  FOREIGN KEY ("reranker_model_id")
  REFERENCES "ai_models"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
