# Observability Manifest

Status: accepted

## Technology Boundary

OpenTelemetry Collector for telemetry ingestion. Prometheus for metrics. Loki for logs. Tempo for traces (volume-backed storage). Grafana for dashboards. GlitchTip for error tracking in the default Compose baseline.

## Responsibilities

1. Logging, tracing, and metric conventions.
2. Backend request-boundary request telemetry and uncaught-error capture.
3. Module-level telemetry requirements.
4. Alert metadata and correlation support.
5. Grafana dashboard provisioning.
6. Service-level objective declarations and dashboard ownership.
7. Module health probe registration.

## Permission Scopes

| Scope              | Description                                     |
| ------------------ | ----------------------------------------------- |
| `observation:read` | Read observability data, dashboards, and alerts |

## Feature Flags

| Flag                                 | Purpose                           | Billable | Default | Allowed Scopes |
| ------------------------------------ | --------------------------------- | -------- | ------- | -------------- |
| `observability.enabled`              | Module visibility                 | No       | true    | platform       |
| `observability.errorTrackingEnabled` | Enable platform error capture     | No       | false   | platform       |
| `observability.sloDashboards`        | Enable SLO dashboard provisioning | No       | false   | platform       |

## Config Keys

| Key                                               | Description                               | Default | Billable | Allowed Scopes |
| ------------------------------------------------- | ----------------------------------------- | ------- | -------- | -------------- |
| `observability.tracesSampleRate`                  | Fraction of traces to sample (0.0–1.0)    | 0.1     | No       | platform       |
| `observability.slo.errorBudgetAlertWindowMinutes` | Rolling window for SLO burn-rate alerting | 60      | No       | platform       |

## Data Classifications

| Data                   | Classification      |
| ---------------------- | ------------------- |
| Structured logs        | internal            |
| Trace spans            | internal            |
| Metric series          | internal            |
| Error tracking reports | tenant-confidential |

## Projection Profiles

| Profile | Visible Fields                             | Audited Fields |
| ------- | ------------------------------------------ | -------------- |
| admin   | traceId, spanId, service, duration, status | —              |
| summary | service, status, duration                  | —              |

## Rules

1. Structured logs only.
2. Permission and sensitive-read behavior should emit useful telemetry where appropriate.
3. Shared backend request boundaries should emit request telemetry through the observability adapter and route uncaught failures into the error-tracking adapter when the OTLP and error-tracking environment is configured.
4. Modules must define their important health indicators.
5. Critical SLOs must identify their source metrics or trace-derived indicators.
