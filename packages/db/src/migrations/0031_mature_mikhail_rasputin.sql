CREATE TYPE "public"."classic_rule_type" AS ENUM('championship', 'team_pair');--> statement-breakpoint
ALTER TYPE "public"."bar_commercial_event_type" ADD VALUE 'classic_exposure';--> statement-breakpoint
ALTER TYPE "public"."bar_commercial_event_type" ADD VALUE 'classic_click';--> statement-breakpoint
CREATE TABLE "classic_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_version_id" text NOT NULL,
	"rule_type" "classic_rule_type" NOT NULL,
	"championship" text,
	"team_a_slug" text,
	"team_b_slug" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classic_rule_unique_rule_key" UNIQUE NULLS NOT DISTINCT("rule_version_id","rule_type","championship","team_a_slug","team_b_slug"),
	CONSTRAINT "classic_rule_shape" CHECK ((
        ("classic_rule"."rule_type" = 'championship'
          AND "classic_rule"."championship" IS NOT NULL
          AND "classic_rule"."team_a_slug" IS NULL
          AND "classic_rule"."team_b_slug" IS NULL)
        OR
        ("classic_rule"."rule_type" = 'team_pair'
          AND "classic_rule"."championship" IS NULL
          AND "classic_rule"."team_a_slug" IS NOT NULL
          AND "classic_rule"."team_b_slug" IS NOT NULL
          AND "classic_rule"."team_a_slug" <> "classic_rule"."team_b_slug")
      ))
);
--> statement-breakpoint
CREATE TABLE "classic_rule_version" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classic_rule_version_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "bar_commercial_daily_rollup" ADD COLUMN "classic_exposures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_commercial_daily_rollup" ADD COLUMN "classic_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_commercial_event" ADD COLUMN "classic_rule_id" text;--> statement-breakpoint
ALTER TABLE "bar_commercial_event" ADD COLUMN "classic_rule_version_id" text;--> statement-breakpoint
ALTER TABLE "bar_commercial_event" ADD COLUMN "classic_rule_version" integer;--> statement-breakpoint
ALTER TABLE "bar_commercial_event" ADD COLUMN "classic_rule_reason" text;--> statement-breakpoint
ALTER TABLE "bar_commercial_monthly_rollup" ADD COLUMN "classic_exposures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_commercial_monthly_rollup" ADD COLUMN "classic_clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "classic_rule" ADD CONSTRAINT "classic_rule_rule_version_id_classic_rule_version_id_fk" FOREIGN KEY ("rule_version_id") REFERENCES "public"."classic_rule_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classic_rule_ruleVersionId_idx" ON "classic_rule" USING btree ("rule_version_id");--> statement-breakpoint
INSERT INTO "classic_rule_version" ("id", "version", "created_at")
VALUES ('classic-v1', 1, NOW());--> statement-breakpoint
INSERT INTO "classic_rule" (
	"id", "rule_version_id", "rule_type", "team_a_slug", "team_b_slug", "reason"
)
VALUES
	('classic-v1-flamengo-palmeiras', 'classic-v1', 'team_pair', 'flamengo', 'palmeiras', 'Flamengo x Palmeiras: rivalidade editorial'),
	('classic-v1-flamengo-vasco', 'classic-v1', 'team_pair', 'flamengo', 'vasco', 'Flamengo x Vasco: rivalidade editorial'),
	('classic-v1-flamengo-fluminense', 'classic-v1', 'team_pair', 'flamengo', 'fluminense', 'Flamengo x Fluminense: rivalidade editorial'),
	('classic-v1-corinthians-palmeiras', 'classic-v1', 'team_pair', 'corinthians', 'palmeiras', 'Corinthians x Palmeiras: rivalidade editorial'),
	('classic-v1-sao-paulo-palmeiras', 'classic-v1', 'team_pair', 'sao-paulo', 'palmeiras', 'São Paulo x Palmeiras: rivalidade editorial'),
	('classic-v1-gremio-internacional', 'classic-v1', 'team_pair', 'gremio', 'internacional', 'Grêmio x Internacional: rivalidade editorial'),
	('classic-v1-atletico-mg-cruzeiro', 'classic-v1', 'team_pair', 'atletico-mg', 'cruzeiro', 'Atlético-MG x Cruzeiro: rivalidade editorial'),
	('classic-v1-botafogo-fluminense', 'classic-v1', 'team_pair', 'botafogo', 'fluminense', 'Botafogo x Fluminense: rivalidade editorial');
