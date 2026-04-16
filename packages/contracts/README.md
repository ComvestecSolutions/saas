# Contracts Package

This package contains the shared schemas, constants, and derived types that define the backend contract surface for the foundation.

The source tree follows the repository contract taxonomy:

- `access/`
- `data/`
- `module-registry/`
- `runtime/`
- `domains/`

Use this package as the source of truth for reusable backend vocabularies and schema-backed types such as module ids, actor types, scopes, data classifications, projection profiles, runtime payloads, and module boundary contracts.

Downstream packages should import named exported types from here when they already exist instead of re-deriving `Schema.Schema.Type<typeof ...>` aliases locally.

This package is shared by config manifests, module services, platform adapters and services, application shells, and tests.
