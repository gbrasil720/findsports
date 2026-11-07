CREATE TABLE "bar_notice" (
	"bar_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bar_notice_bar_id_kind_ref_pk" PRIMARY KEY("bar_id","kind","ref")
);
--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "notice_weekly_summary" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "notice_game_filling" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bar" ADD COLUMN "notice_empty_schedule" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bar_notice" ADD CONSTRAINT "bar_notice_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;