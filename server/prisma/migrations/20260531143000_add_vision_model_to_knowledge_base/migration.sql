ALTER TYPE "ai_model_type" ADD VALUE 'IMAGE';

ALTER TABLE "knowledge_bases"
  ADD COLUMN "vision_model_id" UUID;

CREATE INDEX "knowledge_bases_vision_model_id_idx"
  ON "knowledge_bases"("vision_model_id");

ALTER TABLE "knowledge_bases"
  ADD CONSTRAINT "knowledge_bases_vision_model_id_fkey"
  FOREIGN KEY ("vision_model_id")
  REFERENCES "ai_models"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
