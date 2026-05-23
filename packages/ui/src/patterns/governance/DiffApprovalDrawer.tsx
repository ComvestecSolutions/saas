import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "../../primitives/Dialog/Dialog";
import { Button } from "../../primitives/Button/Button";
import { Textarea } from "../../primitives/Textarea/Textarea";
import { StatusChip, type StatusChipTone } from "../data/StatusChip";

/**
 * DiffApprovalDrawer — 4-way diff + governed reason + lifecycle
 * timeline for runtime-config and feature-flag approvals
 * (admin-app spec rule §3, plan §8.5).
 *
 * The 4 streams (per spec rule §3):
 *   1. declared default  — what the committed code declares.
 *   2. runtime override  — currently persisted operator override.
 *   3. pending proposal  — the proposal awaiting approval.
 *   4. effective         — the value actually serving traffic.
 *
 * Uses Dialog `lg` size per slice 1b-mid binding decision.
 *
 * The drawer is presentational + governance-aware: it requires a
 * non-empty reason before invoking `onApprove({ reason })` or
 * `onReject({ reason })`. The consuming app helper performs the
 * mutation behind shared services so authorization + audit stay
 * backend-owned.
 */
export type DiffApprovalStreamKey =
  | "declaredDefault"
  | "runtimeOverride"
  | "pendingProposal"
  | "effective";

export type DiffApprovalStream = {
  readonly key: DiffApprovalStreamKey;
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly tone?: StatusChipTone;
};

export type DiffApprovalLifecycleEvent = {
  readonly id: string;
  readonly timestamp: string;
  readonly label: ReactNode;
  readonly actor?: ReactNode;
  readonly tone?: StatusChipTone;
};

export type DiffApprovalDecisionInput = {
  readonly reason: string;
};

export type DiffApprovalDrawerProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly streams: readonly DiffApprovalStream[];
  readonly lifecycle?: readonly DiffApprovalLifecycleEvent[];
  readonly onApprove: (input: DiffApprovalDecisionInput) => void;
  readonly onReject?: (input: DiffApprovalDecisionInput) => void;
};

const streamOrder: readonly DiffApprovalStreamKey[] = [
  "declaredDefault",
  "runtimeOverride",
  "pendingProposal",
  "effective",
];

const defaultStreamLabel: Record<DiffApprovalStreamKey, string> = {
  declaredDefault: "Declared default",
  runtimeOverride: "Runtime override",
  pendingProposal: "Pending proposal",
  effective: "Effective",
};

export function DiffApprovalDrawer({
  open,
  onOpenChange,
  title,
  description,
  streams,
  lifecycle,
  onApprove,
  onReject,
}: DiffApprovalDrawerProps) {
  const [reason, setReason] = useState("");

  const ordered = streamOrder
    .map((key) => streams.find((stream) => stream.key === key))
    .filter((stream): stream is DiffApprovalStream => stream !== undefined);

  const reasonValid = reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={typeof title === "string" ? title : "Approval"}
        description={
          description ??
          "Review the diff across declared default, runtime override, and active value before approving."
        }
        actions={
          <>
            <DialogClose asChild>
              <Button
                variant="ghost"
                data-testid="diff-approval-cancel"
                onClick={() => {
                  onOpenChange(false);
                  setReason("");
                }}
              >
                Cancel
              </Button>
            </DialogClose>
            {onReject !== undefined ? (
              <Button
                variant="danger"
                disabled={!reasonValid}
                data-testid="diff-approval-reject"
                onClick={() => {
                  onReject({ reason: reason.trim() });
                  setReason("");
                }}
              >
                Reject
              </Button>
            ) : null}
            <Button
              variant="primary"
              disabled={!reasonValid}
              data-testid="diff-approval-approve"
              onClick={() => {
                onApprove({ reason: reason.trim() });
                setReason("");
              }}
            >
              Approve
            </Button>
          </>
        }
      >
        <div
          data-pattern="diff-approval-drawer"
          data-testid="diff-approval-body"
        >
          <div
            data-testid="diff-approval-streams"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 6,
            }}
          >
            {ordered.map((stream) => (
              <article
                key={stream.key}
                data-stream={stream.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  padding: 6,
                  background:
                    "color-mix(in oklab, var(--canvas-900) 30%, transparent)",
                  border:
                    "1px solid color-mix(in oklab, white 6%, transparent)",
                  borderRadius: 4,
                }}
              >
                <header
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: "var(--fg-muted)",
                    }}
                  >
                    {stream.label ?? defaultStreamLabel[stream.key]}
                  </span>
                  {stream.tone !== undefined ? (
                    <StatusChip tone={stream.tone} size="sm">
                      {stream.tone}
                    </StatusChip>
                  ) : null}
                </header>
                <pre
                  style={{
                    margin: 0,
                    fontFamily:
                      "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                    fontSize: "0.75rem",
                    color: "var(--fg-default)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {stream.value}
                </pre>
              </article>
            ))}
          </div>
          {lifecycle !== undefined && lifecycle.length > 0 ? (
            <section
              data-testid="diff-approval-lifecycle"
              style={{
                marginTop: 8,
                padding: 6,
                border: "1px solid color-mix(in oklab, white 6%, transparent)",
                borderRadius: 4,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  marginBottom: 4,
                  fontSize: "0.6875rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--fg-muted)",
                }}
              >
                Lifecycle
              </h3>
              <ol
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {lifecycle.map((event) => (
                  <li
                    key={event.id}
                    data-lifecycle-event={event.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "0.75rem",
                      color: "var(--fg-default)",
                    }}
                  >
                    <time
                      dateTime={event.timestamp}
                      style={{
                        fontFamily:
                          "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                        fontSize: "0.6875rem",
                        color: "var(--fg-muted)",
                      }}
                    >
                      {event.timestamp}
                    </time>
                    {event.tone !== undefined ? (
                      <StatusChip tone={event.tone} size="sm">
                        {event.tone}
                      </StatusChip>
                    ) : null}
                    <span style={{ flex: 1 }}>{event.label}</span>
                    {event.actor !== undefined ? (
                      <span style={{ color: "var(--fg-muted)" }}>
                        {event.actor}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <div style={{ marginTop: 8 }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                color: "var(--fg-muted)",
                marginBottom: 4,
              }}
            >
              Decision reason
            </label>
            <Textarea
              aria-label="Decision reason"
              data-testid="diff-approval-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
