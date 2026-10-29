CREATE TABLE "attendance_checkin" (
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"distance_m" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_checkin_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "rating_stars_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "rating_stars_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_rating" ADD COLUMN "stars" smallint;--> statement-breakpoint
ALTER TABLE "bar_rating" ADD COLUMN "comment" text;--> statement-breakpoint
ALTER TABLE "bar_rating" ADD COLUMN "comment_review" "review_status";--> statement-breakpoint
ALTER TABLE "bar_rating" ADD COLUMN "comment_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "bar_rating" ADD COLUMN "identified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_rating" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_checkin" ADD CONSTRAINT "attendance_checkin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_checkin" ADD CONSTRAINT "attendance_checkin_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_checkin_eventId_idx" ON "attendance_checkin" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "bar_rating_comment_pending_idx" ON "bar_rating" USING btree ("updated_at") WHERE comment_review = 'pending';--> statement-breakpoint
ALTER TABLE "bar_rating" ADD CONSTRAINT "bar_rating_stars_range" CHECK ("bar_rating"."stars" IS NULL OR "bar_rating"."stars" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "bar_rating" ADD CONSTRAINT "bar_rating_comment_review" CHECK (("bar_rating"."comment" IS NULL) = ("bar_rating"."comment_review" IS NULL) AND ("bar_rating"."comment" IS NULL OR char_length("bar_rating"."comment") BETWEEN 1 AND 280) AND ("bar_rating"."comment_review" IS NOT DISTINCT FROM 'rejected') = ("bar_rating"."comment_rejection_reason" IS NOT NULL) AND ("bar_rating"."comment_rejection_reason" IS NULL OR char_length("bar_rating"."comment_rejection_reason") BETWEEN 1 AND 300));--> statement-breakpoint
-- WEB-408: avaliação verificada é a de quem teve o código validado no balcão
-- (e não desfeito) ou fez check-in naquele jogo. É a mesma visita de
-- `packages/api/src/lib/visits.ts`, escrita em SQL para os triggers; o teste
-- de integração confere que as duas concordam.
CREATE OR REPLACE FUNCTION "bar_rating_is_verified"(p_user text, p_event text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM "attendance_checkin" c
    WHERE c."user_id" = p_user AND c."event_id" = p_event
  ) OR EXISTS (
    SELECT 1
    FROM "reservation_code_use" u
    JOIN "reservation_code" rc ON rc."id" = u."code_id"
    JOIN "reservation" r ON r."id" = rc."reservation_id"
    WHERE r."user_id" = p_user AND r."event_id" = p_event
      AND u."undone_at" IS NULL
  )
$$ LANGUAGE sql STABLE;
--> statement-breakpoint
-- `verified` é do banco: calculado a cada gravação, qualquer que seja o
-- código que gravou (inclusive o anterior a esta migration).
CREATE OR REPLACE FUNCTION "bar_rating_set_verified"() RETURNS trigger AS $$
BEGIN
  NEW."verified" := "bar_rating_is_verified"(NEW."actor_user_id", NEW."event_id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "bar_rating_verified_trigger" ON "bar_rating";
--> statement-breakpoint
CREATE TRIGGER "bar_rating_verified_trigger"
  BEFORE INSERT OR UPDATE ON "bar_rating"
  FOR EACH ROW EXECUTE FUNCTION "bar_rating_set_verified"();
--> statement-breakpoint
-- A prova que chega (ou sai) depois da avaliação: refaz `verified` das
-- avaliações daquele torcedor naquele jogo, e o trigger de contadores segue.
CREATE OR REPLACE FUNCTION "bar_rating_reverify"(p_user text, p_event text)
RETURNS void AS $$
  UPDATE "bar_rating" SET "verified" = "bar_rating_is_verified"(p_user, p_event)
  WHERE "actor_user_id" = p_user AND "event_id" = p_event
    AND "verified" IS DISTINCT FROM "bar_rating_is_verified"(p_user, p_event)
$$ LANGUAGE sql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "bar_rating_reverify_from_code_use"() RETURNS trigger AS $$
BEGIN
  PERFORM "bar_rating_reverify"(r."user_id", r."event_id")
  FROM "reservation_code" rc
  JOIN "reservation" r ON r."id" = rc."reservation_id"
  WHERE rc."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."code_id" ELSE NEW."code_id" END;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "bar_rating_reverify_code_use_trigger" ON "reservation_code_use";
--> statement-breakpoint
CREATE TRIGGER "bar_rating_reverify_code_use_trigger"
  AFTER INSERT OR UPDATE OF "undone_at" OR DELETE ON "reservation_code_use"
  FOR EACH ROW EXECUTE FUNCTION "bar_rating_reverify_from_code_use"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "bar_rating_reverify_from_checkin"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "bar_rating_reverify"(OLD."user_id", OLD."event_id");
  ELSE
    PERFORM "bar_rating_reverify"(NEW."user_id", NEW."event_id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "bar_rating_reverify_checkin_trigger" ON "attendance_checkin";
--> statement-breakpoint
CREATE TRIGGER "bar_rating_reverify_checkin_trigger"
  AFTER INSERT OR DELETE ON "attendance_checkin"
  FOR EACH ROW EXECUTE FUNCTION "bar_rating_reverify_from_checkin"();
--> statement-breakpoint
-- Contadores do bar só com as verificadas (WEB-408), mais as estrelas
-- (WEB-451). Recontados do zero a cada mudança, no lugar do +1/-1 da 0022:
-- com `verified` mudando por fora, a conta incremental teria mais casos do
-- que linhas. ponytail: varre as avaliações do bar a cada gravação; com
-- milhares por bar, volta a ser incremental.
CREATE OR REPLACE FUNCTION "bar_rating_recount"(p_bar text) RETURNS void AS $$
  UPDATE "bar" SET
    "rating_count" = s.n,
    "rating_positive" = s.positive,
    "rating_stars_count" = s.stars_n,
    "rating_stars_sum" = s.stars_sum
  FROM (
    SELECT
      count(*) FILTER (WHERE "verified")::int AS n,
      count(*) FILTER (WHERE "verified" AND "would_return")::int AS positive,
      count("stars") FILTER (WHERE "verified")::int AS stars_n,
      COALESCE(sum("stars") FILTER (WHERE "verified"), 0)::int AS stars_sum
    FROM "bar_rating" WHERE "bar_id" = p_bar
  ) s
  WHERE "bar"."id" = p_bar
    AND ("rating_count", "rating_positive", "rating_stars_count", "rating_stars_sum")
      IS DISTINCT FROM (s.n, s.positive, s.stars_n, s.stars_sum)
$$ LANGUAGE sql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "bar_rating_sync"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM "bar_rating_recount"(OLD."bar_id");
    RETURN OLD;
  END IF;
  PERFORM "bar_rating_recount"(NEW."bar_id");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Backfill: hoje só o código do balcão verifica (não há check-in ainda).
-- Tocar cada linha passa pelos dois triggers: `verified` calculado e o bar
-- recontado só com as verificadas. Bar sem nenhuma avaliação verificada fica
-- sem nota pública, e é a decisão (WEB-408).
UPDATE "bar_rating" SET "verified" = "bar_rating_is_verified"("actor_user_id", "event_id");
