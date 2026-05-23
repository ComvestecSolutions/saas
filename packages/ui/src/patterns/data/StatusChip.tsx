import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Badge, type BadgeVariant } from "../../primitives/Badge/Badge";

/**
 * `patterns/data/StatusChip` is the canonical typed semantic alias
 * over the generic `primitives/Badge` (slice 1b decision 1c). The
 * primitive intentionally stays vocabulary-free; this wrapper adds
 * the Operator Desk status palette.
 *
 * Tone palette (canonical):
 *   nominal → active palette (emerald)   — healthy / current
 *   pending → pending palette (amber)    — verifying / scheduled
 *   drift   → drift palette (violet)     — drifted / deprecated
 *   error   → error palette (crimson)    — failed / blocked / denied
 *   success → active palette (emerald)   — applied / succeeded
 *
 * Back-compat shim: the prior `patterns/admin/StatusChip` accepted
 * `{ status, variant }` (raw BadgeVariant + free string body). To keep
 * the admin-app building until slice 1b-tail finishes the tear-down,
 * the canonical export also accepts that legacy shape. The legacy
 * `patterns/admin/StatusChip` continues to live in
 * `patterns/admin/` and is re-exported by the patterns barrel as
 * `LegacyStatusChip` for direct callers.
 */
export type StatusChipTone =
  | "nominal"
  | "pending"
  | "drift"
  | "error"
  | "success";

const toneToBadgeVariant: Record<StatusChipTone, BadgeVariant> = {
  nominal: "active",
  pending: "pending",
  drift: "drift",
  error: "error",
  success: "active",
};

type StatusChipBase = Omit<
  ComponentPropsWithoutRef<typeof Badge>,
  "variant" | "children"
>;

type StatusChipTonalProps = StatusChipBase & {
  readonly tone: StatusChipTone;
  readonly children: ReactNode;
  readonly status?: never;
  readonly variant?: never;
};

type StatusChipLegacyProps = StatusChipBase & {
  readonly status: string;
  readonly variant: BadgeVariant;
  readonly tone?: never;
  readonly children?: never;
};

export type StatusChipProps = StatusChipTonalProps | StatusChipLegacyProps;

const isLegacyProps = (
  props: StatusChipProps,
): props is StatusChipLegacyProps =>
  (props as StatusChipLegacyProps).status !== undefined &&
  (props as StatusChipLegacyProps).variant !== undefined;

export function StatusChip(props: StatusChipProps) {
  if (isLegacyProps(props)) {
    const { status, variant, ...rest } = props;
    return (
      <Badge variant={variant} {...rest}>
        {status}
      </Badge>
    );
  }
  const { tone, children, ...rest } = props;
  return (
    <Badge variant={toneToBadgeVariant[tone]} data-tone={tone} {...rest}>
      {children}
    </Badge>
  );
}

export const statusChipToneToBadgeVariant = (
  tone: StatusChipTone,
): BadgeVariant => toneToBadgeVariant[tone];
