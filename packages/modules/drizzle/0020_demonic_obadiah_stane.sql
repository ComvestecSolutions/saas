CREATE TABLE "import_export_jobs" (
	"job_id" text PRIMARY KEY NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"source" varchar(64) NOT NULL,
	"format" varchar(16) NOT NULL,
	"status" varchar(32) NOT NULL,
	"requested_by" text NOT NULL,
	"row_count" integer,
	"artifact_file_id" text,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
