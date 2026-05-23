CREATE TABLE "admin_saved_views" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"owner_subject_id" text NOT NULL,
	"name" text NOT NULL,
	"resource_kind" varchar(64) NOT NULL,
	"serialized_view" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "admin_saved_views_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE "admin_workspaces" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"owner_subject_id" text NOT NULL,
	"name" text NOT NULL,
	"serialized_layout" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_workspaces_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_saved_views_owner_name_uq" ON "admin_saved_views" USING btree ("owner_subject_id","name");--> statement-breakpoint
CREATE INDEX "admin_saved_views_owner_idx" ON "admin_saved_views" USING btree ("owner_subject_id");--> statement-breakpoint
CREATE INDEX "admin_saved_views_owner_resource_idx" ON "admin_saved_views" USING btree ("owner_subject_id","resource_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_workspaces_owner_name_uq" ON "admin_workspaces" USING btree ("owner_subject_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_workspaces_owner_position_uq" ON "admin_workspaces" USING btree ("owner_subject_id","position");--> statement-breakpoint
CREATE INDEX "admin_workspaces_owner_idx" ON "admin_workspaces" USING btree ("owner_subject_id");