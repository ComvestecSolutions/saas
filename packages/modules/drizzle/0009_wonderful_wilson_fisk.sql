CREATE TABLE "support_operations_break_glass_incidents" (
	"case_id" text NOT NULL,
	"support_agent" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'pending-review' NOT NULL,
	"approved_by" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "support_operations_break_glass_incidents_case_id_pk" PRIMARY KEY("case_id")
);
--> statement-breakpoint
CREATE INDEX "support_ops_break_glass_status_idx" ON "support_operations_break_glass_incidents" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "support_ops_break_glass_agent_idx" ON "support_operations_break_glass_incidents" USING btree ("support_agent","started_at");