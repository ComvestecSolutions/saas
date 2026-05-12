CREATE TABLE "notification_center_email_preferences" (
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"channel" varchar(16) NOT NULL,
	"recipient" text NOT NULL,
	"template" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_center_email_preferences_tenant_scope_tenant_scope_id_channel_recipient_template_pk" PRIMARY KEY("tenant_scope","tenant_scope_id","channel","recipient","template")
);
--> statement-breakpoint
ALTER TABLE "notification_center_email_receipts" ALTER COLUMN "email_delivery_message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_center_email_receipts" ADD COLUMN "suppression_reason" text;--> statement-breakpoint
CREATE INDEX "notification_center_email_preferences_tenant_recipient_idx" ON "notification_center_email_preferences" USING btree ("tenant_scope","tenant_scope_id","recipient");