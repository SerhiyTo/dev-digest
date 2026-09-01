CREATE TABLE "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cases_total" integer,
	"cases_passed" integer,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"cost_usd" double precision,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "suite_run_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "agent_version" integer;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_suite_runs_agent_started_idx" ON "eval_suite_runs" USING btree ("agent_id","started_at");--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("suite_run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_runs_suite_run_id_idx" ON "eval_runs" USING btree ("suite_run_id");