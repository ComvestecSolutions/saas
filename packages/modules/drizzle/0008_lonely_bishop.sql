CREATE TABLE "search_tenant_indexes" (
	"index_name" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"lifecycle_state" varchar(32) NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"settings" jsonb,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_tenant_indexes_index_name_pk" PRIMARY KEY("index_name")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "search_tenant_indexes_scope_unique_idx" ON "search_tenant_indexes" USING btree ("scope","scope_id");--> statement-breakpoint
CREATE INDEX "search_tenant_indexes_scope_state_idx" ON "search_tenant_indexes" USING btree ("scope","scope_id","lifecycle_state");