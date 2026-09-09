CREATE TABLE "bar_commercial_event_daily_rollup" (
	"bar_id" text NOT NULL,
	"event_id" text NOT NULL,
	"commercial_day" date NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"directions_opened" integer DEFAULT 0 NOT NULL,
	"phone_clicked" integer DEFAULT 0 NOT NULL,
	"whatsapp_opened" integer DEFAULT 0 NOT NULL,
	"is_finalized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_commercial_event_daily_rollup_pkey" UNIQUE("bar_id","event_id","commercial_day")
);
--> statement-breakpoint
ALTER TABLE "bar_commercial_event_daily_rollup" ADD CONSTRAINT "bar_commercial_event_daily_rollup_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bar_commercial_event_daily_rollup_barId_commercialDay_idx" ON "bar_commercial_event_daily_rollup" USING btree ("bar_id","commercial_day");
--> statement-breakpoint
-- Backfill atribuição dos eventos brutos que ainda existem. Dias já podados
-- antes desta migration não têm como ser reconstruídos sem a dimensão perdida.
INSERT INTO "bar_commercial_event_daily_rollup" (
	"bar_id", "event_id", "commercial_day",
	"profile_views", "directions_opened", "phone_clicked", "whatsapp_opened",
	"is_finalized", "created_at", "updated_at"
)
SELECT
	e."bar_id",
	e."source_event_id",
	e."commercial_day",
	COUNT(*) FILTER (WHERE e."type" = 'profile_view'),
	COUNT(*) FILTER (WHERE e."type" = 'directions_opened'),
	COUNT(*) FILTER (WHERE e."type" = 'phone_clicked'),
	COUNT(*) FILTER (WHERE e."type" = 'whatsapp_opened'),
	COALESCE(bool_and(COALESCE(d."is_finalized", false)), false),
	NOW(),
	NOW()
FROM "bar_commercial_event" e
LEFT JOIN "bar_commercial_daily_rollup" d
	ON d."bar_id" = e."bar_id"
	AND d."commercial_day" = e."commercial_day"
WHERE e."source_event_id" IS NOT NULL
GROUP BY e."bar_id", e."source_event_id", e."commercial_day"
ON CONFLICT ("bar_id", "event_id", "commercial_day") DO NOTHING;
