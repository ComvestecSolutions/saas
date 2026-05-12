CREATE TABLE "tenant_membership_invitations" (
	"invitation_id" text NOT NULL,
	"tenant_scope" varchar(32) NOT NULL,
	"tenant_scope_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"relation" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"issued_by" text NOT NULL,
	"correlation_id" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	CONSTRAINT "tenant_membership_invitations_invitation_id_pk" PRIMARY KEY("invitation_id")
);
--> statement-breakpoint
CREATE INDEX "tenant_membership_invites_scope_idx" ON "tenant_membership_invitations" USING btree ("tenant_scope","tenant_scope_id","issued_at");--> statement-breakpoint
CREATE INDEX "tenant_membership_invites_status_idx" ON "tenant_membership_invitations" USING btree ("status","expires_at");