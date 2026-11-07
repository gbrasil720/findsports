CREATE TABLE "ai_action" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"kind" text NOT NULL,
	"bar_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_run" (
	"run_id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"feature" text NOT NULL,
	"variant" text NOT NULL,
	"assigned_model" text NOT NULL,
	"served_model" text,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"useful" boolean DEFAULT false NOT NULL,
	"feedback" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_run_feedback" CHECK ("ai_run"."feedback" IS NULL OR "ai_run"."feedback" IN (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "ai_action" ADD CONSTRAINT "ai_action_run_id_ai_run_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_run"("run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run" ADD CONSTRAINT "ai_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_action_run_idx" ON "ai_action" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_run_user_created_idx" ON "ai_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_run_created_idx" ON "ai_run" USING btree ("created_at");