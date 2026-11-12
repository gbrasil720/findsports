CREATE TABLE "bar_game_dismissal" (
	"bar_id" text NOT NULL,
	"weekly_game_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_game_dismissal_bar_id_weekly_game_id_pk" PRIMARY KEY("bar_id","weekly_game_id")
);
--> statement-breakpoint
CREATE TABLE "weekly_game" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"key" text NOT NULL,
	"sport_id" text NOT NULL,
	"championship" text NOT NULL,
	"title" text NOT NULL,
	"home_team_id" text,
	"away_team_id" text,
	"starts_at" timestamp NOT NULL,
	"channels" text[] DEFAULT '{}' NOT NULL,
	"channel_confirmed" boolean DEFAULT false NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_game_week_key" UNIQUE("week_start","key")
);
--> statement-breakpoint
ALTER TABLE "bar_game_dismissal" ADD CONSTRAINT "bar_game_dismissal_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_game_dismissal" ADD CONSTRAINT "bar_game_dismissal_weekly_game_id_weekly_game_id_fk" FOREIGN KEY ("weekly_game_id") REFERENCES "public"."weekly_game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_game" ADD CONSTRAINT "weekly_game_sport_id_sport_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sport"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_game" ADD CONSTRAINT "weekly_game_home_team_id_team_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_game" ADD CONSTRAINT "weekly_game_away_team_id_team_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bar_game_dismissal_game_idx" ON "bar_game_dismissal" USING btree ("weekly_game_id");--> statement-breakpoint
CREATE INDEX "weekly_game_starts_at_idx" ON "weekly_game" USING btree ("starts_at");