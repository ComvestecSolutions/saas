CREATE TABLE "admin_member_invitations" (
	"invitation_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"invited_role" varchar(32) NOT NULL,
	"invited_by" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"correlation_id" text,
	CONSTRAINT "admin_member_invitations_invitation_id_pk" PRIMARY KEY("invitation_id")
);
--> statement-breakpoint
CREATE TABLE "admin_members" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"keycloak_subject_id" text,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"invited_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "admin_members_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
ALTER TABLE "admin_member_invitations" ADD CONSTRAINT "admin_member_invitations_invited_by_admin_members_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."admin_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_member_invitations_token_hash_uq" ON "admin_member_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_member_invitations_email_idx" ON "admin_member_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "admin_member_invitations_status_expires_idx" ON "admin_member_invitations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_members_email_uq" ON "admin_members" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_members_keycloak_subject_uq" ON "admin_members" USING btree ("keycloak_subject_id");--> statement-breakpoint
CREATE INDEX "admin_members_role_idx" ON "admin_members" USING btree ("role");