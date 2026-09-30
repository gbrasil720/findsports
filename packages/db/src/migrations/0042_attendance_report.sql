CREATE TABLE "attendance_report" (
	"user_id" text NOT NULL,
	"event_id" text NOT NULL,
	"attended" boolean NOT NULL,
	"offer_received" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_report_user_id_event_id_pk" PRIMARY KEY("user_id","event_id"),
	CONSTRAINT "attendance_report_offer_only_if_attended" CHECK ("attendance_report"."attended" OR "attendance_report"."offer_received" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "attendance_report" ADD CONSTRAINT "attendance_report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_report" ADD CONSTRAINT "attendance_report_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_report_eventId_idx" ON "attendance_report" USING btree ("event_id");