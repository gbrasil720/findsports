CREATE TYPE "public"."bar_photo_category" AS ENUM('telao', 'area_externa', 'balcao', 'comida', 'salao', 'fachada');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "bar_photo" (
	"id" text PRIMARY KEY NOT NULL,
	"bar_id" text NOT NULL,
	"url" text NOT NULL,
	"category" "bar_photo_category" NOT NULL,
	"caption" text,
	"position" integer NOT NULL,
	"cover_requested" boolean DEFAULT false NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bar_photo_bar_url_unique" UNIQUE("bar_id","url"),
	CONSTRAINT "bar_photo_caption_length" CHECK ("bar_photo"."caption" IS NULL OR char_length("bar_photo"."caption") BETWEEN 1 AND 80),
	CONSTRAINT "bar_photo_rejection_reason" CHECK (("bar_photo"."status" = 'rejected') = ("bar_photo"."rejection_reason" IS NOT NULL) AND ("bar_photo"."rejection_reason" IS NULL OR char_length("bar_photo"."rejection_reason") BETWEEN 1 AND 300))
);
--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "description_pending" text;--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "description_review" "review_status";--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "description_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "description_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "bar_photo" ADD CONSTRAINT "bar_photo_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bar_photo_bar_idx" ON "bar_photo" USING btree ("bar_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "bar_photo_cover_requested_idx" ON "bar_photo" USING btree ("bar_id") WHERE cover_requested;--> statement-breakpoint
CREATE INDEX "bar_photo_pending_idx" ON "bar_photo" USING btree ("created_at") WHERE status = 'pending';--> statement-breakpoint
ALTER TABLE "bar" ADD CONSTRAINT "bar_description_pending_length" CHECK ("bar"."description_pending" IS NULL OR char_length("bar"."description_pending") BETWEEN 1 AND 500);--> statement-breakpoint
-- WEB-462: as fotos que já estavam no ar entram aprovadas, para não sumirem no
-- deploy: a capa (bar.photo_url) primeiro, depois a galeria antiga, na mesma
-- ordem. Sem categoria antes, todas entram como "Salão"; o dono troca no
-- painel. `gallery_photos` fica até o contract.
INSERT INTO "bar_photo" ("id", "bar_id", "url", "category", "position", "status", "reviewed_at")
SELECT gen_random_uuid()::text, "id", "photo_url", 'salao', 0, 'approved', now()
FROM "bar"
WHERE "photo_url" IS NOT NULL
ON CONFLICT ("bar_id", "url") DO NOTHING;--> statement-breakpoint
INSERT INTO "bar_photo" ("id", "bar_id", "url", "category", "position", "status", "reviewed_at")
SELECT gen_random_uuid()::text, "bar"."id", "g"."url", 'salao', "g"."ord"::int, 'approved', now()
FROM "bar" CROSS JOIN LATERAL unnest("bar"."gallery_photos") WITH ORDINALITY AS "g"("url", "ord")
ON CONFLICT ("bar_id", "url") DO NOTHING;
