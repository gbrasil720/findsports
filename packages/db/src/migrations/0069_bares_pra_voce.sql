ALTER TYPE "public"."recommendation_event_type" ADD VALUE 'attend';--> statement-breakpoint
CREATE TABLE "bar_game_alert" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bar_id" text NOT NULL,
	"sport_id" text,
	"team_id" text,
	"run_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bar_game_alert_user_bar_sport_team_key" UNIQUE NULLS NOT DISTINCT("user_id","bar_id","sport_id","team_id"),
	CONSTRAINT "bar_game_alert_sport_or_team" CHECK ("bar_game_alert"."sport_id" IS NOT NULL OR "bar_game_alert"."team_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "game_reminder" (
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_reminder_user_id_event_id_pk" PRIMARY KEY("user_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "recommendation_round" (
	"run_id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"day" date NOT NULL,
	"radius_km" integer NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_round_actor_day_key" UNIQUE("actor_user_id","day")
);
--> statement-breakpoint
ALTER TABLE "bar_game_alert" ADD CONSTRAINT "bar_game_alert_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_game_alert" ADD CONSTRAINT "bar_game_alert_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_game_alert" ADD CONSTRAINT "bar_game_alert_sport_id_sport_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sport"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_game_alert" ADD CONSTRAINT "bar_game_alert_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reminder" ADD CONSTRAINT "game_reminder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reminder" ADD CONSTRAINT "game_reminder_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_round" ADD CONSTRAINT "recommendation_round_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bar_game_alert_bar_idx" ON "bar_game_alert" USING btree ("bar_id");