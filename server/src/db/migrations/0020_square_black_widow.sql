CREATE TABLE "onboarding_generations" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" text NOT NULL,
	"provider" text,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" double precision,
	"degraded_reason" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "files_indexed" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "indexed_sha" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "onboarding_generations" ADD CONSTRAINT "onboarding_generations_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_generations" ADD CONSTRAINT "onboarding_generations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;