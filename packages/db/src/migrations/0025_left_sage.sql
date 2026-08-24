ALTER TABLE "user" ADD COLUMN "dodo_customer_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_dodo_customer_id_unique" UNIQUE("dodo_customer_id");--> statement-breakpoint
-- Existing accounts predate mandatory verification and were already treated
-- as authenticated. Preserve their access; new registrations remain false
-- until Better Auth consumes the verification token.
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
