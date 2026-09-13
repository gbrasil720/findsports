CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'confirmed', 'declined', 'cancelled');--> statement-breakpoint
CREATE TABLE "reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"party_size" smallint NOT NULL,
	"note" text,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"offer_snapshot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_party_size_positive" CHECK ("reservation"."party_size" >= 1),
	CONSTRAINT "reservation_note_length" CHECK ("reservation"."note" IS NULL OR char_length("reservation"."note") <= 280)
);
--> statement-breakpoint
CREATE TABLE "reservation_code" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"reservation_id" text NOT NULL,
	"max_uses" smallint NOT NULL,
	"used_count" smallint DEFAULT 0 NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_code_format" CHECK ("reservation_code"."code" ~ '^[A-Z0-9]{4,12}$'),
	CONSTRAINT "reservation_code_max_uses_positive" CHECK ("reservation_code"."max_uses" >= 1),
	CONSTRAINT "reservation_code_used_count_bounds" CHECK ("reservation_code"."used_count" >= 0 AND "reservation_code"."used_count" <= "reservation_code"."max_uses")
);
--> statement-breakpoint
CREATE TABLE "reservation_code_use" (
	"id" text PRIMARY KEY NOT NULL,
	"code_id" text NOT NULL,
	"validated_by_user_id" text,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone,
	CONSTRAINT "reservation_code_use_undone_after_used" CHECK ("reservation_code_use"."undone_at" IS NULL OR "reservation_code_use"."undone_at" >= "reservation_code_use"."used_at")
);
--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_code" ADD CONSTRAINT "reservation_code_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_code_use" ADD CONSTRAINT "reservation_code_use_code_id_reservation_code_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."reservation_code"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_code_use" ADD CONSTRAINT "reservation_code_use_validated_by_user_id_user_id_fk" FOREIGN KEY ("validated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_active_user_event_key" ON "reservation" USING btree ("user_id","event_id") WHERE status IN ('pending', 'confirmed');--> statement-breakpoint
CREATE INDEX "reservation_eventId_status_createdAt_idx" ON "reservation" USING btree ("event_id","status","created_at");--> statement-breakpoint
CREATE INDEX "reservation_userId_createdAt_idx" ON "reservation" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_code_active_code_key" ON "reservation_code" USING btree ("code") WHERE retired_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_code_active_reservation_key" ON "reservation_code" USING btree ("reservation_id") WHERE retired_at IS NULL;--> statement-breakpoint
CREATE INDEX "reservation_code_reservationId_idx" ON "reservation_code" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "reservation_code_use_codeId_usedAt_idx" ON "reservation_code_use" USING btree ("code_id","used_at");--> statement-breakpoint
CREATE INDEX "reservation_code_use_validatedByUserId_idx" ON "reservation_code_use" USING btree ("validated_by_user_id");--> statement-breakpoint

-- `reservation_code.used_count` é mantido a partir de `reservation_code_use`,
-- no mesmo padrão dos contadores de `bar_rating` (0022). Cada uso válido soma
-- um; desfazer (`undone_at` preenchido) ou apagar o uso devolve.
--
-- O limite não é checado aqui: o UPDATE esbarra em
-- `reservation_code_used_count_bounds` e o INSERT do uso excedente aborta
-- junto. O UPDATE também trava a linha do código, então dois bares validando o
-- último lugar ao mesmo tempo fazem fila em vez de passar os dois.
CREATE OR REPLACE FUNCTION "reservation_code_use_sync"() RETURNS trigger AS $$
DECLARE
  delta smallint := 0;
  target text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target := NEW."code_id";
    IF NEW."undone_at" IS NULL THEN
      delta := 1;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD."code_id";
    IF OLD."undone_at" IS NULL THEN
      delta := -1;
    END IF;
  ELSE
    IF NEW."code_id" IS DISTINCT FROM OLD."code_id" THEN
      RAISE EXCEPTION 'reservation_code_use.code_id não pode ser alterado';
    END IF;
    target := NEW."code_id";
    IF OLD."undone_at" IS NULL AND NEW."undone_at" IS NOT NULL THEN
      delta := -1;
    ELSIF OLD."undone_at" IS NOT NULL AND NEW."undone_at" IS NULL THEN
      delta := 1;
    END IF;
  END IF;

  IF delta <> 0 THEN
    UPDATE "reservation_code"
      SET "used_count" = "used_count" + delta,
          "updated_at" = now()
      WHERE "id" = target;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER "reservation_code_use_sync_trigger"
  AFTER INSERT OR UPDATE OR DELETE ON "reservation_code_use"
  FOR EACH ROW EXECUTE FUNCTION "reservation_code_use_sync"();