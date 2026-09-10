-- CreateEnum
CREATE TYPE "subscription_plan" AS ENUM ('basic', 'investor', 'professional');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'canceled', 'past_due', 'incomplete');

-- CreateEnum
CREATE TYPE "report_price_basis" AS ENUM ('subscriber', 'non_subscriber');

-- CreateEnum
CREATE TYPE "report_order_status" AS ENUM ('pending_payment', 'queued', 'generating', 'awaiting_review', 'approved', 'delivered', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan" "subscription_plan" NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "status" "subscription_status" NOT NULL,
    "current_period_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_tiers" (
    "code" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "subscriber_price_cents" INTEGER NOT NULL,
    "non_subscriber_price_cents" INTEGER NOT NULL,
    "requires_human_review" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_tiers_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "report_orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "report_tier_code" TEXT NOT NULL,
    "price_paid_cents" INTEGER NOT NULL,
    "price_basis" "report_price_basis" NOT NULL,
    "upgrade_credit_applied_cents" INTEGER NOT NULL DEFAULT 0,
    "status" "report_order_status" NOT NULL,
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "content" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "report_orders_user_id_idx" ON "report_orders"("user_id");

-- CreateIndex
CREATE INDEX "report_orders_property_id_idx" ON "report_orders"("property_id");

-- CreateIndex
CREATE INDEX "report_orders_report_tier_code_idx" ON "report_orders"("report_tier_code");

-- CreateIndex
CREATE INDEX "report_orders_status_idx" ON "report_orders"("status");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_orders" ADD CONSTRAINT "report_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_orders" ADD CONSTRAINT "report_orders_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_orders" ADD CONSTRAINT "report_orders_report_tier_code_fkey" FOREIGN KEY ("report_tier_code") REFERENCES "report_tiers"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
