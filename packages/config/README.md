# Config Package

This package is the typed configuration surface for the Comvestec SaaS foundation.

It owns the shared inputs that describe how the platform is declared and configured:

- platform defaults and validated environment modeling
- module manifest schemas and the 19-manifest registry
- shared platform constants and module type aliases
- config-key, feature-flag, runtime-value, and field-vocabulary exports that other packages consume

Use this package when code needs declared configuration or manifest metadata. Accepted manifests describe the approved capability catalog, but they do not imply that every module is already implemented. Use [../../specs/00-governance/implementation-tracker.md](../../specs/00-governance/implementation-tracker.md) for current maturity.

Primary entrypoints:

- `src/defaults.ts`
- `src/environment.ts`
- `src/platform-constants.ts`
- `src/module-types.ts`
- `src/manifests/registry.ts`

This package is consumed by the platform, modules, apps, and tests so shared config and vocabulary stay versioned in one place.
