CREATE TABLE "attendance" (
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_eventId_idx" ON "attendance" USING btree ("event_id");--> statement-breakpoint
-- Reserva implica presença (ADR 0003): pedidos anteriores a esta tabela entram como presença.
INSERT INTO "attendance" ("user_id", "event_id", "created_at")
SELECT "user_id", "event_id", min("created_at") FROM "reservation" GROUP BY "user_id", "event_id";
