CREATE TABLE "tenant_provisioning_receipts" (
	"provisioning_id" text NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"owner_actor_id" text NOT NULL,
	"status" varchar(32) NOT NULL,
	"correlation_id" text,
	"authorization_tuples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"request_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provisioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_provisioning_receipts_provisioning_id_pk" PRIMARY KEY("provisioning_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_provisioning_receipts_scope_idx" ON "tenant_provisioning_receipts" USING btree ("tenant_scope","tenant_scope_id");--> statement-breakpoint
CREATE INDEX "tenant_provisioning_receipts_owner_idx" ON "tenant_provisioning_receipts" USING btree ("owner_actor_id","updated_at");