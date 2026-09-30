CREATE TABLE "user_favorite_teams" (
	"user_id" text NOT NULL,
	"sport_id" text NOT NULL,
	"team_id" text NOT NULL,
	CONSTRAINT "user_favorite_teams_user_id_team_id_pk" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "user_favorite_teams" ADD CONSTRAINT "user_favorite_teams_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_teams" ADD CONSTRAINT "user_favorite_teams_user_sport_fk" FOREIGN KEY ("user_id","sport_id") REFERENCES "public"."user_preference_sports"("user_id","sport_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_favorite_teams_teamId_idx" ON "user_favorite_teams" USING btree ("team_id");