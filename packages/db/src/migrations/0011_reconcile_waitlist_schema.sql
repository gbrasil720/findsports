ALTER TABLE "waitlist_entries" ADD COLUMN IF NOT EXISTS "city" text;--> statement-breakpoint
UPDATE "waitlist_entries"
SET "city" = 'Não informado'
WHERE "city" IS NULL OR btrim("city") = '';--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "city" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" DROP CONSTRAINT IF EXISTS "waitlist_entries_email_unique";--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "pub_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "pub_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" DROP COLUMN IF EXISTS "name";--> statement-breakpoint
ALTER TABLE "waitlist_entries" DROP COLUMN IF EXISTS "bairro";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "city_idx" ON "waitlist_entries" USING btree ("city");--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'waitlist_entries_email_role_city_unique'
      AND conrelid = 'public.waitlist_entries'::regclass
  ) THEN
    ALTER TABLE "waitlist_entries"
      ADD CONSTRAINT "waitlist_entries_email_role_city_unique"
      UNIQUE ("email", "role", "city");
  END IF;
END
$$;
