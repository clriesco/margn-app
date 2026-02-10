-- AlterTable: add clerk_id to users (nullable during migration)
ALTER TABLE "users" ADD COLUMN "clerk_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");
