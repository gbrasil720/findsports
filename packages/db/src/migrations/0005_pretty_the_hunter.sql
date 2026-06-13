CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'inactive', 'past_due');--> statement-breakpoint
CREATE TABLE "bar" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"phone" text,
	"address" text NOT NULL,
	"neighborhood" text NOT NULL,
	"city" text NOT NULL,
	"latitude" numeric(10, 8) NOT NULL,
	"longitude" numeric(11, 8) NOT NULL,
	"photo_url" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bar_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"bar_id" text NOT NULL,
	"sport_id" text NOT NULL,
	"championship" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"event_id" text NOT NULL,
	"team_id" text NOT NULL,
	CONSTRAINT "event_participants_event_id_team_id_pk" PRIMARY KEY("event_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "sport" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sport_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"bar_id" text NOT NULL,
	"status" "subscription_status" DEFAULT 'trialing' NOT NULL,
	"dodo_subscription_id" text,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_bar_id_unique" UNIQUE("bar_id"),
	CONSTRAINT "subscription_dodo_subscription_id_unique" UNIQUE("dodo_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"sport_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country" text,
	"logo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_favorite_bars" (
	"user_id" text NOT NULL,
	"bar_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_favorite_bars_user_id_bar_id_pk" PRIMARY KEY("user_id","bar_id")
);
--> statement-breakpoint
CREATE TABLE "user_preference_sports" (
	"user_id" text NOT NULL,
	"sport_id" text NOT NULL,
	CONSTRAINT "user_preference_sports_user_id_sport_id_pk" PRIMARY KEY("user_id","sport_id")
);
--> statement-breakpoint
ALTER TABLE "bar" ADD CONSTRAINT "bar_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_sport_id_sport_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sport"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_sport_id_sport_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sport"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_bars" ADD CONSTRAINT "user_favorite_bars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_bars" ADD CONSTRAINT "user_favorite_bars_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference_sports" ADD CONSTRAINT "user_preference_sports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preference_sports" ADD CONSTRAINT "user_preference_sports_sport_id_sport_id_fk" FOREIGN KEY ("sport_id") REFERENCES "public"."sport"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bar_userId_idx" ON "bar" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_barId_idx" ON "event" USING btree ("bar_id");--> statement-breakpoint
CREATE INDEX "event_sportId_idx" ON "event" USING btree ("sport_id");--> statement-breakpoint
CREATE INDEX "event_startsAt_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "team_sportId_idx" ON "team" USING btree ("sport_id");