ALTER TABLE "tenant_membership_invitations" ADD COLUMN "token_hash" text;
--> statement-breakpoint
ALTER TABLE "tenant_membership_invitations" ADD COLUMN "redeemed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tenant_membership_invitations" ADD COLUMN "redeemed_by" text;
--> statement-breakpoint
CREATE INDEX "tenant_membership_invites_token_hash_idx" ON "tenant_membership_invitations" USING btree ("token_hash");