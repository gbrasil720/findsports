CREATE TABLE "job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"result" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "job_run_job_started_at_idx" ON "job_run" USING btree ("job","started_at");