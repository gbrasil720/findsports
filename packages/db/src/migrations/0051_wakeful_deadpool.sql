ALTER TABLE "user" DROP CONSTRAINT "user_dodo_customer_id_unique";--> statement-breakpoint
ALTER TABLE "subscription" DROP CONSTRAINT "subscription_dodo_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "dodo_customer_id";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "dodo_subscription_id";