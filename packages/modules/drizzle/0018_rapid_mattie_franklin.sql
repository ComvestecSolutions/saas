CREATE TABLE "webhook_outbound_deliveries" (
	"delivery_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"exhausted_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_outbound_deliveries_delivery_id_pk" PRIMARY KEY("delivery_id")
);
--> statement-breakpoint
CREATE INDEX "webhook_outbound_deliveries_scope_status_idx" ON "webhook_outbound_deliveries" USING btree ("scope","scope_id","status");--> statement-breakpoint
CREATE INDEX "webhook_outbound_deliveries_subscription_idx" ON "webhook_outbound_deliveries" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_outbound_deliveries_next_attempt_idx" ON "webhook_outbound_deliveries" USING btree ("status","next_attempt_at");