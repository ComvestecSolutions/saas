# 009 Performance and State Management Baseline

Status: accepted

## Goal

The platform should feel instant without accumulating client-state overhead or hidden cache behavior.

## State Ownership

1. TanStack Start route loaders own route-scoped server data.
2. Convex subscriptions own hot, collaborative, or reactive data.
3. Local component state owns ephemeral UI state.
4. A global client-state library is not the default.

## Data Loading Rules

1. Use typed route params and search params.
2. Prefetch on intent when the route is likely to be visited next.
3. Use streaming and progressive rendering where it improves perceived speed.
4. Use optimistic updates only for flows that benefit materially from instant feedback.
5. Define query budgets and projection profiles per module.

## Performance Guardrails

1. Avoid over-fetching.
2. Paginate list views.
3. Reserve real-time subscriptions for views that need them.
4. Keep admin inspection efficient even when audit history is large.
