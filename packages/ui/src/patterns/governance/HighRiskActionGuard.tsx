import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
} from "../../primitives/Dialog/Dialog";
import { Button } from "../../primitives/Button/Button";
import {
  RadioGroup,
  type RadioOption,
} from "../../primitives/RadioGroup/RadioGroup";
import { Textarea } from "../../primitives/Textarea/Textarea";

/**
 * HighRiskActionGuard — typed reason picker + double-confirm guard
 * for high-risk operator actions (admin-app spec §8.13, §8.10).
 *
 * Prop shape (binding decision 1b) is compatible with
 * `DenseDataTable.renderBulkActionConfirm`. The admin-app composes
 * this component into the table slot. `selection` is
 * `readonly TRow[]` so the guard renders selection context without
 * the table importing governance code.
 *
 * The component is presentational + governed: it surfaces the reason
 * catalog the caller provides, captures the chosen reason + free-text
 * note, requires a second explicit confirmation step, and then
 * invokes `onConfirm({ reasonId, note })`. The actual mutation /
 * audit / authorization lives in the consuming app helper.
 */
export type HighRiskReason = {
  readonly id: string;
  readonly label: ReactNode;
  readonly description?: ReactNode;
};

export type HighRiskActionGuardAction = {
  readonly id: string;
  readonly label: ReactNode;
};

export type HighRiskActionGuardConfirmInput = {
  readonly reasonId: string;
  readonly note: string;
};

export type HighRiskActionGuardProps<TRow> = {
  readonly action: HighRiskActionGuardAction;
  readonly selection: readonly TRow[];
  readonly reasons: readonly HighRiskReason[];
  readonly onConfirm: (input: HighRiskActionGuardConfirmInput) => void;
  readonly onCancel: () => void;
  readonly renderSelectionSummary?: (selection: readonly TRow[]) => ReactNode;
  readonly requireNote?: boolean;
  readonly confirmLabel?: ReactNode;
};

export function HighRiskActionGuard<TRow>({
  action,
  selection,
  reasons,
  onConfirm,
  onCancel,
  renderSelectionSummary,
  requireNote = false,
  confirmLabel = "Confirm",
}: HighRiskActionGuardProps<TRow>) {
  const [reasonId, setReasonId] = useState<string>("");
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState(false);

  const options: ReadonlyArray<RadioOption> = reasons.map((reason) => ({
    value: reason.id,
    label: (
      <span>
        <span style={{ fontWeight: 600 }}>{reason.label}</span>
        {reason.description !== undefined ? (
          <span
            style={{
              display: "block",
              color: "var(--fg-muted)",
              fontSize: "0.75rem",
            }}
          >
            {reason.description}
          </span>
        ) : null}
      </span>
    ),
  }));

  const canArm =
    reasonId !== "" && (requireNote === false || note.trim().length > 0);

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (next === false) {
          onCancel();
        }
      }}
    >
      <DialogContent
        size="md"
        title={`High-risk: ${typeof action.label === "string" ? action.label : action.id}`}
        description={`Selection: ${selection.length} item${
          selection.length === 1 ? "" : "s"
        }. This action is audited.`}
        actions={
          <>
            <DialogClose asChild>
              <Button
                variant="ghost"
                onClick={onCancel}
                data-testid="high-risk-cancel"
              >
                Cancel
              </Button>
            </DialogClose>
            {armed ? (
              <Button
                variant="danger"
                data-testid="high-risk-confirm-final"
                onClick={() => {
                  if (reasonId === "") {
                    return;
                  }
                  onConfirm({ reasonId, note: note.trim() });
                }}
              >
                {confirmLabel}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!canArm}
                data-testid="high-risk-arm"
                onClick={() => setArmed(true)}
              >
                Continue
              </Button>
            )}
          </>
        }
      >
        <div
          data-pattern="high-risk-action-guard"
          data-action={action.id}
          data-testid="high-risk-body"
        >
          {renderSelectionSummary !== undefined ? (
            <div data-testid="high-risk-summary" style={{ marginBottom: 8 }}>
              {renderSelectionSummary(selection)}
            </div>
          ) : null}
          <p
            style={{
              margin: 0,
              marginBottom: 4,
              fontSize: "0.8125rem",
              color: "var(--fg-default)",
            }}
          >
            {action.label}
          </p>
          <RadioGroup
            name={`high-risk-reason-${action.id}`}
            aria-label="Reason"
            options={options}
            value={reasonId}
            onValueChange={(value) => {
              setReasonId(value);
              setArmed(false);
            }}
          />
          <div style={{ marginTop: 8 }}>
            <label
              style={{
                display: "block",
                fontSize: "0.75rem",
                color: "var(--fg-muted)",
                marginBottom: 4,
              }}
            >
              Note{requireNote ? "" : " (optional)"}
            </label>
            <Textarea
              data-testid="high-risk-note"
              aria-label="High-risk action note"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setArmed(false);
              }}
            />
          </div>
          {armed ? (
            <p
              data-testid="high-risk-armed-banner"
              style={{
                marginTop: 8,
                padding: 6,
                fontSize: "0.75rem",
                background: "var(--status-error-bg)",
                border: "1px solid var(--status-error-border)",
                color: "var(--status-error-fg)",
                borderRadius: 4,
              }}
            >
              Press {String(confirmLabel)} again to apply.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
