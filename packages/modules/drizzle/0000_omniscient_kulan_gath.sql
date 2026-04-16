CREATE TABLE "audit_log_events" (
	"event_id" text NOT NULL,
	"module_id" varchar(64) NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"actor_id" text NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"reason" text,
	"correlation_id" text,
	"request_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_events_event_id_pk" PRIMARY KEY("event_id")
);
--> statement-breakpoint
CREATE TABLE "billing_customer_accounts" (
	"account_id" text NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_customer_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"email" text,
	"status" varchar(32) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customer_accounts_account_id_pk" PRIMARY KEY("account_id")
);
--> statement-breakpoint
CREATE TABLE "billing_entitlements" (
	"entitlement_id" text NOT NULL,
	"module_id" varchar(64) NOT NULL,
	"feature_key" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"quota_snapshot" jsonb,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "billing_entitlements_entitlement_id_pk" PRIMARY KEY("entitlement_id")
);
--> statement-breakpoint
CREATE TABLE "billing_payment_events" (
	"event_id" text NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_event_id" text NOT NULL,
	"subscription_id" text,
	"scope" varchar(32),
	"scope_id" text,
	"event_type" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"amount_minor" integer,
	"currency" varchar(16),
	"effective_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_payment_events_event_id_pk" PRIMARY KEY("event_id")
);
--> statement-breakpoint
CREATE TABLE "billing_plan_entitlements" (
	"entitlement_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"module_id" varchar(64) NOT NULL,
	"feature_key" text,
	"included" boolean DEFAULT true NOT NULL,
	"metered" boolean DEFAULT false NOT NULL,
	"meter_key" text,
	"unit" text,
	"quota_limit" integer,
	"quota_period" varchar(16),
	"enforcement_mode" varchar(32),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "billing_plan_entitlements_entitlement_id_pk" PRIMARY KEY("entitlement_id")
);
--> statement-breakpoint
CREATE TABLE "billing_plan_prices" (
	"price_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"billing_interval" varchar(16) NOT NULL,
	"currency" varchar(16) NOT NULL,
	"amount_minor" integer NOT NULL,
	"provider_price_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_plan_prices_price_id_pk" PRIMARY KEY("price_id")
);
--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"plan_id" text NOT NULL,
	"plan_key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_plans_plan_id_pk" PRIMARY KEY("plan_id")
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"subscription_id" text NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"account_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"price_id" text,
	"status" varchar(32) NOT NULL,
	"checkout_session_id" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscriptions_subscription_id_pk" PRIMARY KEY("subscription_id")
);
--> statement-breakpoint
CREATE TABLE "identity_session_audit" (
	"event_id" text NOT NULL,
	"session_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"provider" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_session_audit_event_id_pk" PRIMARY KEY("event_id")
);
--> statement-breakpoint
CREATE TABLE "runtime_config_overrides" (
	"override_id" text NOT NULL,
	"module_id" varchar(64) NOT NULL,
	"key" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"source" varchar(32) NOT NULL,
	"changed_by" text NOT NULL,
	"approval_reason" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runtime_config_overrides_override_id_pk" PRIMARY KEY("override_id")
);
--> statement-breakpoint
CREATE TABLE "runtime_config_sync_artifacts" (
	"proposal_id" text NOT NULL,
	"module_id" varchar(64) NOT NULL,
	"key" text NOT NULL,
	"action" varchar(32) NOT NULL,
	"artifact_path" text NOT NULL,
	"runtime_value" jsonb,
	"code_value" jsonb,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runtime_config_sync_artifacts_proposal_id_pk" PRIMARY KEY("proposal_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_branding_domain_verifications" (
	"verification_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"scope_id" text NOT NULL,
	"requested_host" text NOT NULL,
	"lifecycle_state" varchar(32) NOT NULL,
	"dns_proof" jsonb,
	"approved_by" text,
	"approval_notes" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_branding_domain_verifications_verification_id_pk" PRIMARY KEY("verification_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_onboarding_runs" (
	"run_id" text NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"triggered_by" text NOT NULL,
	"status" varchar(32) NOT NULL,
	"current_step_id" text,
	"correlation_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "tenant_onboarding_runs_run_id_pk" PRIMARY KEY("run_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_onboarding_steps" (
	"run_id" text NOT NULL,
	"step_id" text NOT NULL,
	"label" text NOT NULL,
	"required_module_id" varchar(64),
	"status" varchar(32) NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "tenant_onboarding_steps_run_id_step_id_pk" PRIMARY KEY("run_id","step_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_receipts" (
	"receipt_id" text NOT NULL,
	"provider" varchar(64) NOT NULL,
	"delivery_id" text NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"processing_state" varchar(32) DEFAULT 'pending' NOT NULL,
	"verified_signature" boolean DEFAULT false NOT NULL,
	"scope" varchar(32),
	"scope_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "webhook_receipts_receipt_id_pk" PRIMARY KEY("receipt_id")
);
--> statement-breakpoint
CREATE INDEX "audit_log_events_module_idx" ON "audit_log_events" USING btree ("module_id","recorded_at");--> statement-breakpoint
CREATE INDEX "audit_log_events_scope_idx" ON "audit_log_events" USING btree ("tenant_scope","tenant_scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customer_accounts_provider_customer_idx" ON "billing_customer_accounts" USING btree ("provider","provider_customer_id");--> statement-breakpoint
CREATE INDEX "billing_customer_accounts_scope_idx" ON "billing_customer_accounts" USING btree ("scope","scope_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_entitlements_scope_feature_idx" ON "billing_entitlements" USING btree ("module_id","feature_key","scope","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_payment_events_provider_event_idx" ON "billing_payment_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "billing_payment_events_scope_idx" ON "billing_payment_events" USING btree ("scope","scope_id","recorded_at");--> statement-breakpoint
CREATE INDEX "billing_plan_entitlements_plan_idx" ON "billing_plan_entitlements" USING btree ("plan_id","module_id","feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_plan_prices_provider_price_idx" ON "billing_plan_prices" USING btree ("provider_price_id");--> statement-breakpoint
CREATE INDEX "billing_plan_prices_plan_interval_idx" ON "billing_plan_prices" USING btree ("plan_id","billing_interval","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_plans_plan_key_idx" ON "billing_plans" USING btree ("plan_key");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_subscriptions_provider_subscription_idx" ON "billing_subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_scope_idx" ON "billing_subscriptions" USING btree ("scope","scope_id","status");--> statement-breakpoint
CREATE INDEX "identity_session_audit_session_idx" ON "identity_session_audit" USING btree ("session_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_config_overrides_scope_key_idx" ON "runtime_config_overrides" USING btree ("module_id","key","scope","scope_id");--> statement-breakpoint
CREATE INDEX "runtime_config_sync_artifacts_module_idx" ON "runtime_config_sync_artifacts" USING btree ("module_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_branding_domain_scope_host_idx" ON "tenant_branding_domain_verifications" USING btree ("scope","scope_id","requested_host");--> statement-breakpoint
CREATE INDEX "tenant_onboarding_runs_scope_idx" ON "tenant_onboarding_runs" USING btree ("tenant_scope","tenant_scope_id","started_at");--> statement-breakpoint
CREATE INDEX "tenant_onboarding_steps_status_idx" ON "tenant_onboarding_steps" USING btree ("status","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_receipts_provider_delivery_idx" ON "webhook_receipts" USING btree ("provider","delivery_id");--> statement-breakpoint
CREATE INDEX "webhook_receipts_provider_received_idx" ON "webhook_receipts" USING btree ("provider","received_at");