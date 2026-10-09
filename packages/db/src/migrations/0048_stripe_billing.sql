CREATE TABLE "stripe_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'incomplete',
	"period_start" timestamp,
	"period_end" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"cancel_at" timestamp,
	"canceled_at" timestamp,
	"ended_at" timestamp,
	"seats" integer,
	"billing_interval" text,
	"stripe_schedule_id" text
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "external_subscription_id" text;--> statement-breakpoint
CREATE INDEX "stripe_subscription_referenceId_idx" ON "stripe_subscription" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "stripe_subscription_stripeSubscriptionId_idx" ON "stripe_subscription" USING btree ("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_stripe_customer_id_unique" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_external_subscription_id_unique" UNIQUE("external_subscription_id");