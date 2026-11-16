CREATE TABLE "bar_profile_alert" (
	"bar_id" text NOT NULL,
	"alert" text NOT NULL,
	"dismissed_until" timestamp with time zone,
	"shown_on" date,
	CONSTRAINT "bar_profile_alert_bar_id_alert_pk" PRIMARY KEY("bar_id","alert")
);
--> statement-breakpoint
ALTER TABLE "bar_profile_alert" ADD CONSTRAINT "bar_profile_alert_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;