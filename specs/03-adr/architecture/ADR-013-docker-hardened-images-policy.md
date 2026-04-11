# ADR-013 Docker Hardened Images Policy

Status: accepted

## Decision

Use Docker Hardened Images as the default base-image policy for future first-party application containers built by this repository.

Do not replace vendor-owned infrastructure images in the Compose stack with generic hardened images. Services such as PostgreSQL, Keycloak, Grafana, Tempo, Meilisearch, Novu, and similar infrastructure dependencies remain pinned to their upstream vendor images and are secured through version pinning, continuous scanning, and controlled upgrade cadence.

## Rationale

1. Docker Hardened Images are designed for building and distributing first-party application containers with a minimized attack surface, signed metadata, SBOMs, and provenance.
2. The current Compose stack is mostly vendor infrastructure, and those services rely on upstream-maintained entrypoints, runtime layouts, and patch channels that hardened base images do not replace.
3. A mixed policy is more defensible than pretending one image strategy fits both custom app containers and third-party infrastructure products.
4. Continuous verification through Dependabot, `bun audit`, and Trivy scans is required even when using hardened images; hardened images reduce exposure, but they do not eliminate the need for ongoing scanning.
