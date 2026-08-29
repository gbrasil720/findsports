CREATE TYPE "public"."recommendation_event_type" AS ENUM(
	'impression',
	'open',
	'dismiss',
	'unfavorite',
	'favorite',
	'directions_opened',
	'phone_clicked',
	'whatsapp_opened',
	'reset'
);
--> statement-breakpoint
CREATE TABLE "recommendation_event" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"bar_id" text,
	"run_id" text,
	"type" "recommendation_event_type" NOT NULL,
	"position" integer,
	"reason" text,
	"expanded_radius" boolean,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_event_run_actor_bar_type_key" UNIQUE("run_id", "actor_user_id", "bar_id", "type")
);
--> statement-breakpoint
CREATE TABLE "recommendation_reset" (
	"actor_user_id" text PRIMARY KEY NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recommendation_event" ADD CONSTRAINT "recommendation_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recommendation_event" ADD CONSTRAINT "recommendation_event_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "recommendation_reset" ADD CONSTRAINT "recommendation_reset_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "recommendation_event_actor_occurred_idx" ON "recommendation_event" USING btree ("actor_user_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX "recommendation_event_actor_bar_type_occurred_idx" ON "recommendation_event" USING btree ("actor_user_id", "bar_id", "type", "occurred_at");
--> statement-breakpoint
CREATE INDEX "recommendation_event_run_occurred_idx" ON "recommendation_event" USING btree ("run_id", "occurred_at");
