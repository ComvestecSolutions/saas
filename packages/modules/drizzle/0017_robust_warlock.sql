CREATE TABLE "webhook_api_keys" (
	"api_key_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"label" text NOT NULL,
	"secret_hash" text NOT NULL,
	"prefix" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "webhook_api_keys_api_key_id_pk" PRIMARY KEY("api_key_id")
);
--> statement-breakpoint
CREATE INDEX "webhook_api_keys_scope_status_idx" ON "webhook_api_keys" USING btree ("scope","scope_id","status");--> statement-breakpoint
CREATE INDEX "webhook_api_keys_scope_label_idx" ON "webhook_api_keys" USING btree ("scope","scope_id","label");