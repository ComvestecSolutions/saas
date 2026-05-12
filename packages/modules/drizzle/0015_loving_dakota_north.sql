CREATE TABLE "email_delivery_tracking" (
	"message_id" text NOT NULL,
	"provider" varchar(64) NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"recipient" text NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"template" text,
	"sender_display_name" text NOT NULL,
	"from_email" text NOT NULL,
	"reply_to_email" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"last_event_at" timestamp with time zone,
	"bounce_type" varchar(16),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_delivery_tracking_message_id_pk" PRIMARY KEY("message_id")
);
--> statement-breakpoint
CREATE TABLE "email_recipient_suppressions" (
	"suppression_id" text NOT NULL,
	"recipient" text NOT NULL,
	"reason" varchar(32) NOT NULL,
	"source_message_id" text NOT NULL,
	"bounce_type" varchar(16),
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_recipient_suppressions_suppression_id_pk" PRIMARY KEY("suppression_id")
);
--> statement-breakpoint
CREATE INDEX "email_delivery_tracking_tenant_sent_idx" ON "email_delivery_tracking" USING btree ("tenant_scope","tenant_scope_id","sent_at");--> statement-breakpoint
CREATE INDEX "email_delivery_tracking_status_idx" ON "email_delivery_tracking" USING btree ("status","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_recipient_suppressions_recipient_idx" ON "email_recipient_suppressions" USING btree ("recipient");--> statement-breakpoint