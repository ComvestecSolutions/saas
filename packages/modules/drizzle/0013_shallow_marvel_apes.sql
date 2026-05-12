CREATE TABLE "support_operations_cases" (
	"case_id" text NOT NULL,
	"support_agent" text NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"summary" text NOT NULL,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "support_operations_cases_case_id_pk" PRIMARY KEY("case_id")
);
--> statement-breakpoint
CREATE INDEX "support_ops_cases_status_idx" ON "support_operations_cases" USING btree ("status","last_updated_at");--> statement-breakpoint
CREATE INDEX "support_ops_cases_tenant_idx" ON "support_operations_cases" USING btree ("tenant_scope","tenant_scope_id","last_updated_at");--> statement-breakpoint
CREATE INDEX "support_ops_cases_agent_idx" ON "support_operations_cases" USING btree ("support_agent","last_updated_at");