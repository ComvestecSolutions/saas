CREATE TABLE "admin_operator_test_token_usage_events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"failure_reason" varchar(32),
	"correlation_id" text NOT NULL,
	CONSTRAINT "admin_operator_test_token_usage_events_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "admin_operator_test_tokens" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"token_prefix" varchar(32) NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"issued_by" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"reason_catalog_id" text NOT NULL,
	"reason_attachment_text" text,
	"last_used_at" timestamp with time zone,
	"last_used_outcome" varchar(16),
	"archived_at" timestamp with time zone,
	CONSTRAINT "admin_operator_test_tokens_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE INDEX "admin_operator_test_token_usage_events_token_id_idx" ON "admin_operator_test_token_usage_events" USING btree ("token_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_operator_test_tokens_prefix_uq" ON "admin_operator_test_tokens" USING btree ("token_prefix");--> statement-breakpoint
CREATE INDEX "admin_operator_test_tokens_issued_by_idx" ON "admin_operator_test_tokens" USING btree ("issued_by","revoked_at");--> statement-breakpoint
CREATE INDEX "admin_operator_test_tokens_expires_at_idx" ON "admin_operator_test_tokens" USING btree ("expires_at");