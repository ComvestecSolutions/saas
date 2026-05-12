CREATE TABLE "notification_center_email_receipts" (
	"notification_id" text NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"channel" varchar(16) NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"email_delivery_message_id" text NOT NULL,
	"queue_receipt_id" text,
	"queue_failure_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_center_email_receipts_notification_id_pk" PRIMARY KEY("notification_id")
);
--> statement-breakpoint
CREATE INDEX "notification_center_email_receipts_tenant_status_idx" ON "notification_center_email_receipts" USING btree ("tenant_scope","tenant_scope_id","status");--> statement-breakpoint
CREATE INDEX "notification_center_email_receipts_delivery_idx" ON "notification_center_email_receipts" USING btree ("email_delivery_message_id");