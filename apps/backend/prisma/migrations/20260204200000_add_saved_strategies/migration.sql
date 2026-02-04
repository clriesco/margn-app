-- CreateTable
CREATE TABLE "saved_strategies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "config_json" TEXT NOT NULL,
    "metrics_json" TEXT NOT NULL,
    "trajectories_json" TEXT NOT NULL,

    CONSTRAINT "saved_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_strategies_user_id_idx" ON "saved_strategies"("user_id");

-- AddForeignKey
ALTER TABLE "saved_strategies" ADD CONSTRAINT "saved_strategies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
