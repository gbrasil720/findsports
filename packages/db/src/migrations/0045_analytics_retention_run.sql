CREATE TABLE "analytics_retention_run" (
	"id" text PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"retention_days" integer NOT NULL,
	"apagar_eventos_brutos" boolean NOT NULL,
	"ok" boolean NOT NULL,
	"dias_finalizados" integer,
	"eventos_podaveis" integer,
	"eventos_apagados" integer,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_retention_run_startedAt_idx" ON "analytics_retention_run" USING btree ("started_at");