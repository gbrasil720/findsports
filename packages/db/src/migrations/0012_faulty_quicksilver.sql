CREATE TYPE "public"."bar_commercial_event_type" AS ENUM('profile_view', 'directions_opened', 'phone_clicked', 'whatsapp_opened');--> statement-breakpoint
CREATE TABLE "bar_commercial_daily_rollup" (
	"bar_id" text NOT NULL,
	"commercial_day" date NOT NULL,
	"unique_visitors" integer DEFAULT 0 NOT NULL,
	"interested_people" integer DEFAULT 0 NOT NULL,
	"high_intent_actions" integer DEFAULT 0 NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"directions_opened" integer DEFAULT 0 NOT NULL,
	"phone_clicked" integer DEFAULT 0 NOT NULL,
	"whatsapp_opened" integer DEFAULT 0 NOT NULL,
	"is_finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_commercial_daily_rollup_pkey" UNIQUE("bar_id","commercial_day")
);
--> statement-breakpoint
CREATE TABLE "bar_commercial_event" (
	"id" text PRIMARY KEY NOT NULL,
	"bar_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"type" "bar_commercial_event_type" NOT NULL,
	"source_event_id" text,
	"source_event_championship" text,
	"source_event_starts_at" timestamp,
	"occurred_at" timestamp with time zone NOT NULL,
	"commercial_day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_commercial_event_dedup_key" UNIQUE NULLS NOT DISTINCT("bar_id","actor_user_id","type","commercial_day","source_event_id")
);
--> statement-breakpoint
CREATE TABLE "bar_commercial_monthly_rollup" (
	"bar_id" text NOT NULL,
	"period_month" date NOT NULL,
	"unique_visitors" integer DEFAULT 0 NOT NULL,
	"interested_people" integer DEFAULT 0 NOT NULL,
	"high_intent_actions" integer DEFAULT 0 NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"directions_opened" integer DEFAULT 0 NOT NULL,
	"phone_clicked" integer DEFAULT 0 NOT NULL,
	"whatsapp_opened" integer DEFAULT 0 NOT NULL,
	"is_finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_commercial_monthly_rollup_pkey" UNIQUE("bar_id","period_month")
);
--> statement-breakpoint
CREATE TABLE "rollup_checkpoint" (
	"bar_id" text NOT NULL,
	"last_processed_at" timestamp with time zone NOT NULL,
	"rollup_period_start" timestamp with time zone NOT NULL,
	"rollup_period_end" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rollup_checkpoint_barId_key" UNIQUE("bar_id")
);
--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "phone_accepts_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_commercial_daily_rollup" ADD CONSTRAINT "bar_commercial_daily_rollup_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_commercial_event" ADD CONSTRAINT "bar_commercial_event_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_commercial_event" ADD CONSTRAINT "bar_commercial_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_commercial_event" ADD CONSTRAINT "bar_commercial_event_source_event_id_event_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."event"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_commercial_monthly_rollup" ADD CONSTRAINT "bar_commercial_monthly_rollup_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_checkpoint" ADD CONSTRAINT "rollup_checkpoint_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bar_commercial_daily_rollup_barId_commercialDay_idx" ON "bar_commercial_daily_rollup" USING btree ("bar_id","commercial_day");--> statement-breakpoint
CREATE INDEX "bar_commercial_event_barId_occurredAt_idx" ON "bar_commercial_event" USING btree ("bar_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bar_commercial_event_barId_sourceEventId_occurredAt_idx" ON "bar_commercial_event" USING btree ("bar_id","source_event_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bar_commercial_event_actorUserId_occurredAt_idx" ON "bar_commercial_event" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "bar_commercial_monthly_rollup_barId_periodMonth_idx" ON "bar_commercial_monthly_rollup" USING btree ("bar_id","period_month");