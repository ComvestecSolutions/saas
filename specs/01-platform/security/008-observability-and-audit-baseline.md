# 008 Observability and Audit Baseline

Status: accepted

## Telemetry Classes

1. application logs
2. security logs
3. audit logs
4. metrics
5. traces
6. business events

## Required Correlation Context

Every important event should carry as applicable:

1. request id
2. actor id
3. tenant id
4. organization id
5. module id
6. permission profile
7. config version
8. deployment version

## Audit Requirements

Audit at minimum:

1. sign-in and privileged session events
2. permission changes
3. config changes
4. feature rollouts
5. sensitive-field reads when marked as auditable
6. support impersonation and break-glass access
7. data export and deletion events

## Module Audit Declarations

1. Every runtime module must declare its minimum auditable actions.
2. Each declaration must state whether actor reason is required.
3. Each declaration must state whether correlation context is required.
4. Sensitive-read and privileged-access events must identify the projection or access path that triggered the event.

## SLO Requirements

1. Define platform SLOs for availability, latency, and critical background workflows before GA.
2. SLOs must identify their source metric or trace signal.
3. Alert metadata should identify the owning module, dashboard, and escalation path.

## Observability Rules

1. Logs must be structured.
2. Traces must cross app, workflow, and storage boundaries where possible.
3. Alerting should distinguish platform health, security anomalies, and product issues.
4. Health probes and SLO dashboards are first-class operator surfaces, not ad hoc infrastructure notes.
