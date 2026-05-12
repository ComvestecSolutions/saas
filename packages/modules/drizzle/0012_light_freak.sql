CREATE TABLE "support_operations_impersonation_sessions" (
	"case_id" text NOT NULL,
	"support_agent" text NOT NULL,
	"impersonated_user" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"approved_by" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "support_operations_impersonation_sessions_case_id_pk" PRIMARY KEY("case_id")
);
--> statement-breakpoint
CREATE INDEX "support_ops_impersonation_status_idx" ON "support_operations_impersonation_sessions" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "support_ops_impersonation_agent_idx" ON "support_operations_impersonation_sessions" USING btree ("support_agent","started_at");