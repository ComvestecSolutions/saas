CREATE TABLE "webhook_subscriptions" (
	"subscription_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_subscriptions_subscription_id_pk" PRIMARY KEY("subscription_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_subscriptions_scope_url_idx" ON "webhook_subscriptions" USING btree ("scope","scope_id","url");--> statement-breakpoint
CREATE INDEX "webhook_subscriptions_scope_status_idx" ON "webhook_subscriptions" USING btree ("scope","scope_id","status");