ALTER TABLE "waitlist_entries" DROP CONSTRAINT "waitlist_entries_email_role_city_unique";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "admitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "pending_role" "waitlist_role";--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "pending_city" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "pending_phone" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "pending_pub_name" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "confirmation_token_hash" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "confirmation_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "confirmation_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "confirmation_error" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "leave_token_hash" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "invite_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "invite_claimed_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "invite_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "invite_error" text;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "activated_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "launch_notice_claimed_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "launch_notice_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "launch_notice_error" text;--> statement-breakpoint
-- Existing accounts without a known pending enrollment keep their current access.
UPDATE "user" AS account_user
SET "admitted_at" = COALESCE(account_user."created_at", NOW())
WHERE account_user.role = 'admin'
   OR EXISTS (
     SELECT 1 FROM waitlist_entries w
     WHERE lower(trim(w.email)) = lower(account_user.email)
       AND w.approved_at IS NOT NULL
   )
   OR NOT EXISTS (
     SELECT 1 FROM waitlist_entries w
     WHERE lower(trim(w.email)) = lower(account_user.email)
   );--> statement-breakpoint
-- Keep the newest enrollment and merge approval from older duplicates.
WITH grouped AS (
  SELECT
    lower(trim(email)) AS normalized_email,
    (array_agg(id ORDER BY created_at DESC, id DESC))[1] AS keeper_id,
    max(approved_at) AS merged_approved_at,
    (array_agg(approved_by ORDER BY approved_at DESC NULLS LAST)
      FILTER (WHERE approved_by IS NOT NULL))[1] AS merged_approved_by
  FROM waitlist_entries
  GROUP BY lower(trim(email))
)
UPDATE waitlist_entries AS entry
SET
  approved_at = COALESCE(entry.approved_at, grouped.merged_approved_at),
  approved_by = COALESCE(entry.approved_by, grouped.merged_approved_by)
FROM grouped
WHERE entry.id = grouped.keeper_id;--> statement-breakpoint
WITH ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY lower(trim(email)) ORDER BY created_at DESC, id DESC
    ) AS keeper_id
  FROM waitlist_entries
)
DELETE FROM waitlist_entries AS entry
USING ranked
WHERE entry.id = ranked.id AND ranked.id <> ranked.keeper_id;--> statement-breakpoint
UPDATE waitlist_entries
SET email = lower(trim(email)), confirmed_at = COALESCE(confirmed_at, created_at);--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_email_unique" ON "waitlist_entries" USING btree ("email");
