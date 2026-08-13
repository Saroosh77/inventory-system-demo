"use client";

import { useState, type SubmitEvent } from "react";
import { errorMessage } from "@/lib/client/erp-api";
import type { ErpAction } from "@/lib/erp/types";
import { FormError, Modal, ModalActions, TextAreaField } from "./module-ui";

/**
 * Reason capture for cancelling a sales order or an invoice.
 *
 * Cancellation reverses money and stock, so the reason is mandatory and is
 * stored on the audit record. The consequences are spelled out in the modal
 * because they differ depending on how far the document has progressed.
 */
export function CancelDocumentModal({
  title,
  documentNumber,
  consequence,
  buildAction,
  onClose,
  onAction,
  reasonLabel = "Reason for cancellation",
  reasonPlaceholder = "Explain why this document is being cancelled",
  submitLabel,
}: {
  title: string;
  documentNumber: string;
  consequence: string;
  buildAction: (reason: string) => ErpAction;
  onClose: () => void;
  onAction: (action: ErpAction) => Promise<unknown>;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  submitLabel?: string;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onAction(buildAction(reason.trim()));
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      subtitle={`${documentNumber} — this cannot be undone.`}
      onClose={onClose}
      size="compact">
      <form className="erp-form compact-form" onSubmit={submit}>
        <div className="cancel-warning">
          <strong>What happens</strong>
          <small>{consequence}</small>
        </div>
        <TextAreaField
          label={reasonLabel}
          value={reason}
          onChange={setReason}
          placeholder={reasonPlaceholder}
        />
        {error ? <FormError error={error} /> : null}
        <ModalActions
          busy={busy}
          label={submitLabel ?? `Cancel ${documentNumber}`}
          onClose={onClose}
          disabled={reason.trim().length < 5}
        />
      </form>
    </Modal>
  );
}
