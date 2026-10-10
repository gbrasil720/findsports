ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_dodo_customer_id_unique";--> statement-breakpoint
ALTER TABLE "subscription" DROP CONSTRAINT IF EXISTS "subscription_dodo_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "dodo_customer_id";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN IF EXISTS "dodo_subscription_id";