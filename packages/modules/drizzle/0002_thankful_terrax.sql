CREATE TABLE "workflow_jobs" (
	"job_id" text NOT NULL,
	"runtime" varchar(64) NOT NULL,
	"source_module_id" varchar(64) NOT NULL,
	"kind" varchar(64) NOT NULL,
	"trigger" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"gap_reason" varchar(64),
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_jobs_job_id_pk" PRIMARY KEY("job_id")
);
--> statement-breakpoint
CREATE INDEX "workflow_jobs_due_idx" ON "workflow_jobs" USING btree ("source_module_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "workflow_jobs_tenant_idx" ON "workflow_jobs" USING btree ("tenant_scope","tenant_scope_id","source_module_id");