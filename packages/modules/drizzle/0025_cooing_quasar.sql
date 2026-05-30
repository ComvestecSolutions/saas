CREATE TABLE "manual_break_glass_grants" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"granted_to" text NOT NULL,
	"granted_by" text NOT NULL,
	"target_tenant_scope" varchar(32) NOT NULL,
	"target_tenant_scope_id" text NOT NULL,
	"reason_catalog_id" text NOT NULL,
	"reason_narrative" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" varchar(16) NOT NULL,
	"released_at" timestamp with time zone,
	"released_by" text,
	"release_reason_catalog_id" text,
	"correlation_id" text NOT NULL,
	CONSTRAINT "manual_break_glass_grants_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE INDEX "manual_break_glass_granted_to_status_idx" ON "manual_break_glass_grants" USING btree ("granted_to","status");--> statement-breakpoint
CREATE INDEX "manual_break_glass_expires_at_idx" ON "manual_break_glass_grants" USING btree ("expires_at");