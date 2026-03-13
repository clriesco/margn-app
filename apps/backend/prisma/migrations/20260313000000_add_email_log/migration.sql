-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "portfolio_id" TEXT,
    "notification_type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "resend_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error_message" TEXT,
    "deduplication_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_user_id_sent_at_idx" ON "email_logs"("user_id", "sent_at");

-- CreateIndex
CREATE INDEX "email_logs_deduplication_key_idx" ON "email_logs"("deduplication_key");

-- CreateIndex
CREATE INDEX "email_logs_portfolio_id_notification_type_sent_at_idx" ON "email_logs"("portfolio_id", "notification_type", "sent_at");
