/*
  Warnings:

  - You are about to drop the column `is_active` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "users_is_active_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "is_active";
