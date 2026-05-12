DROP INDEX IF EXISTS "tenant_branding_domain_scope_host_idx";--> statement-breakpoint
WITH ranked_domain_verifications AS (
	SELECT
		"verification_id",
		CASE
			WHEN "lifecycle_state" = 'active' THEN 0
			WHEN "lifecycle_state" = 'verifying' THEN 1
			WHEN "lifecycle_state" = 'unverified' THEN 2
			WHEN "lifecycle_state" = 'error' THEN 3
			WHEN "lifecycle_state" = 'retired' THEN 4
			ELSE 5
		END AS "lifecycle_rank",
		row_number() OVER (
			PARTITION BY lower("requested_host")
			ORDER BY
				CASE
					WHEN "lifecycle_state" = 'active' THEN 0
					WHEN "lifecycle_state" = 'verifying' THEN 1
					WHEN "lifecycle_state" = 'unverified' THEN 2
					WHEN "lifecycle_state" = 'error' THEN 3
					WHEN "lifecycle_state" = 'retired' THEN 4
					ELSE 5
				END ASC,
				"changed_at" DESC,
				"verification_id" DESC
		) AS "ranked_row"
	FROM "tenant_branding_domain_verifications"
)
UPDATE "tenant_branding_domain_verifications" AS "verification"
SET "lifecycle_state" = 'retired'
FROM ranked_domain_verifications AS "ranked"
WHERE "verification"."verification_id" = "ranked"."verification_id"
	AND "ranked"."ranked_row" > 1
	AND "verification"."lifecycle_state" <> 'retired';--> statement-breakpoint
UPDATE "tenant_branding_domain_verifications"
SET "requested_host" = lower("requested_host");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_branding_domain_host_idx" ON "tenant_branding_domain_verifications" USING btree ("requested_host") WHERE "lifecycle_state" <> 'retired';