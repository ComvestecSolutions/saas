ALTER TABLE "runtime_config_sync_artifacts" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "runtime_config_sync_artifacts" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "runtime_config_sync_artifacts" ADD COLUMN "decided_at" timestamp with time zone;