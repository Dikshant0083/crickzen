CREATE TABLE "live_matches" (
	"code" text PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"match_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_matches_owner_match" UNIQUE("owner_id","match_id")
);
--> statement-breakpoint
ALTER TABLE "live_matches" ADD CONSTRAINT "live_matches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;