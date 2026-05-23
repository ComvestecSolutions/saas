import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "../../primitives/Dialog/Dialog";
import { Button } from "../../primitives/Button/Button";
import { Textarea } from "../../primitives/Textarea/Textarea";

/**
 * RevealField — governed reveal of secret / regulated-sensitive field
 * data (admin-app spec rules §1–§3, plan §7).
 *
 * Visual states:
 *   - redacted (default): 45° diagonal stripe pattern hides the value
 *     and keeps it unselectable.
 *   - reason capture: opens a dialog; operator must provide a
 *     non-empty reason before the reveal call fires.
 *   - revealed: the consumer-supplied `value` is shown verbatim with
 *     a `Hide` toggle.
 *
 * The component never performs the reveal call itself — the consumer
 * passes `onReveal({ reason })` which must invoke the backend reveal
 * helper. The consumer also passes `onAuditEcho` so the UI can echo
 * the reason + outcome the audit log captured (returned from the
 * reveal helper) without the component bypassing field security.
 */
export type RevealFieldRevealInput = {
  readonly reason: string;
};

export type RevealFieldAuditEchoInput = {
  readonly reason: string;
  readonly correlationId?: string;
};

export type RevealFieldProps = {
  readonly label: ReactNode;
  /** The actual value to render once a reveal has been authorized. */
  readonly value: ReactNode;
  readonly redactedPlaceholder?: ReactNode;
  readonly revealed: boolean;
  readonly onReveal: (input: RevealFieldRevealInput) => void;
  readonly onHide: () => void;
  readonly onAuditEcho?: (input: RevealFieldAuditEchoInput) => void;
  readonly correlationId?: string;
};

const stripeBackground =
  "repeating-linear-gradient(" +
  "45deg, " +
  "color-mix(in oklab, white 6%, transparent) 0 6px, " +
  "color-mix(in oklab, white 0%, transparent) 6px 12px" +
  ")";

export function RevealField({
  label,
  value,
  redactedPlaceholder = "•••••••",
  revealed,
  onReveal,
  onHide,
  onAuditEcho,
  correlationId,
}: RevealFieldProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const close = () => {
    setOpen(false);
    setReason("");
  };

  return (
    <div
      data-pattern="reveal-field"
      data-revealed={revealed ? "true" : "false"}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <span
        style={{
          fontSize: "0.6875rem",
          textTransform: "uppercase",
          color: "var(--fg-muted)",
          letterSpacing: "0.04em",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: 4,
          background: "color-mix(in oklab, var(--canvas-900) 30%, transparent)",
          border: "1px solid color-mix(in oklab, white 6%, transparent)",
          borderRadius: 4,
        }}
      >
        {revealed ? (
          <code
            data-testid="reveal-field-value"
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily:
                "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
              fontSize: "0.8125rem",
              color: "var(--fg-default)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {value}
          </code>
        ) : (
          <span
            data-testid="reveal-field-redaction"
            aria-label="redacted"
            style={{
              flex: 1,
              minHeight: 20,
              borderRadius: 4,
              background: stripeBackground,
              color: "transparent",
              userSelect: "none",
              fontSize: "0.8125rem",
              paddingInline: 4,
            }}
          >
            {redactedPlaceholder}
          </span>
        )}
        {revealed ? (
          <Button
            variant="ghost"
            size="sm"
            data-testid="reveal-field-hide"
            onClick={onHide}
          >
            Hide
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            data-testid="reveal-field-trigger"
            onClick={() => setOpen(true)}
          >
            Reveal
          </Button>
        )}
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next === false) {
            close();
          }
        }}
      >
        <DialogContent
          size="md"
          title="Reveal sensitive field"
          description="Reveals are audited. Capture why this field needs to be visible."
          actions={
            <>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  data-testid="reveal-field-cancel"
                  onClick={close}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="primary"
                data-testid="reveal-field-confirm"
                disabled={reason.trim().length === 0}
                onClick={() => {
                  const trimmed = reason.trim();
                  onReveal({ reason: trimmed });
                  onAuditEcho?.({
                    reason: trimmed,
                    ...(correlationId !== undefined ? { correlationId } : {}),
                  });
                  close();
                }}
              >
                Reveal
              </Button>
            </>
          }
        >
          <label
            style={{
              display: "block",
              fontSize: "0.75rem",
              color: "var(--fg-muted)",
              marginBottom: 4,
            }}
          >
            Reason
          </label>
          <Textarea
            aria-label="Reveal reason"
            data-testid="reveal-field-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
