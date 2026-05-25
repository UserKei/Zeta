-- DropForeignKey
ALTER TABLE "agents" DROP CONSTRAINT "agents_model_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_bases" DROP CONSTRAINT "knowledge_bases_embedding_model_id_fkey";

-- AlterTable
ALTER TABLE "agents" ALTER COLUMN "model_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "knowledge_bases" ALTER COLUMN "embedding_model_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_embedding_model_id_fkey" FOREIGN KEY ("embedding_model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
