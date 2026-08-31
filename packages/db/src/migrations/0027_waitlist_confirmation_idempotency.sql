ALTER TABLE "waitlist_entries" ADD COLUMN "confirmation_consumed_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "joined_claimed_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "joined_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "joined_error" text;