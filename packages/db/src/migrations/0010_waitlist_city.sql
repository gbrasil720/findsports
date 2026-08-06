ALTER TABLE "waitlist_entries" DROP CONSTRAINT "waitlist_entries_email_unique";--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "pub_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "pub_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "city" text;--> statement-breakpoint
UPDATE "waitlist_entries" SET "city" = 'Não informado' WHERE "city" IS NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ALTER COLUMN "city" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "city_idx" ON "waitlist_entries" USING btree ("city");--> statement-breakpoint
ALTER TABLE "waitlist_entries" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "waitlist_entries" DROP COLUMN "bairro";--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_email_role_city_unique" UNIQUE("email","role","city");
