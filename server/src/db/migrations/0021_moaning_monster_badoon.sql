CREATE TABLE "pr_brief_generations" (
	"pr_id" uuid PRIMARY KEY NOT NULL,
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
ALTER TABLE "pr_brief" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "degraded_reason" text;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "truncated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD COLUMN "generated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief_generations" ADD CONSTRAINT "pr_brief_generations_pr_id_pull_requests_id_fk" FOREIGN KEY ("pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_brief_generations" ADD CONSTRAINT "pr_brief_generations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;