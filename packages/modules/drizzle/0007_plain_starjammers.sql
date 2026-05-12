CREATE TABLE "retention_legal_holds" (
	"legal_hold_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"data_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" text NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"placed_by" text NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by" text,
	"released_at" timestamp with time zone,
	CONSTRAINT "retention_legal_holds_legal_hold_id_pk" PRIMARY KEY("legal_hold_id")
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"policy_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"data_type" text NOT NULL,
	"retention_days" integer NOT NULL,
	"changed_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retention_policies_policy_id_pk" PRIMARY KEY("policy_id")
);
--> statement-breakpoint
CREATE INDEX "retention_legal_holds_scope_status_idx" ON "retention_legal_holds" USING btree ("scope","scope_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "retention_legal_holds_active_target_idx" ON "retention_legal_holds" USING btree ("scope","scope_id","data_type","target_id") WHERE "retention_legal_holds"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "retention_policies_scope_data_type_idx" ON "retention_policies" USING btree ("scope","scope_id","data_type");--> statement-breakpoint
CREATE INDEX "retention_policies_scope_idx" ON "retention_policies" USING btree ("scope","scope_id");