CREATE TABLE "runtime_config_override_proposals" (
	"proposal_id" text NOT NULL,
	"module_id" varchar(64) NOT NULL,
	"key" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" varchar(32) NOT NULL,
	"changed_by" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approval_reason" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decision_reason" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "runtime_config_override_proposals_proposal_id_pk" PRIMARY KEY("proposal_id")
);
--> statement-breakpoint
CREATE INDEX "runtime_config_override_proposals_module_idx" ON "runtime_config_override_proposals" USING btree ("module_id","changed_at");