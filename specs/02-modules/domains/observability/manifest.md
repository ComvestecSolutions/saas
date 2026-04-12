# Observability Manifest

Status: accepted

## Technology Boundary

OpenTelemetry Collector for telemetry ingestion. Prometheus for metrics. Loki for logs. Tempo for traces (volume-backed storage). Grafana for dashboards. GlitchTip for error tracking in the default Compose baseline.

## Responsibilities

1. Logging, tracing, and metric conventions.
2. Module-level telemetry requirements.
3. Alert metadata and correlation support.
4. Grafana dashboard provisioning.
5. Service-level objective declarations and dashboard ownership.
6. Module health probe registration.

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
3. Modules must define their important health indicators.
4. Critical SLOs must identify their source metrics or trace-derived indicators.
