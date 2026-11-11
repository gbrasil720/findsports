-- WEB-433: "Times da casa", opcional. Só acrescenta (expand): o código anterior não lê.
CREATE TABLE "bar_team" (
	"bar_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bar_team_bar_id_team_id_pk" PRIMARY KEY("bar_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "bar_team" ADD CONSTRAINT "bar_team_bar_id_bar_id_fk" FOREIGN KEY ("bar_id") REFERENCES "public"."bar"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bar_team" ADD CONSTRAINT "bar_team_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bar_team_teamId_idx" ON "bar_team" USING btree ("team_id");