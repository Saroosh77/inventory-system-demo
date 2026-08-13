"use client";

import { Eye, EyeOff, KeyRound, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type PasswordField = "current" | "new" | "confirm";

export function ChangePasswordDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    current: false,
    new: false,
    confirm: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("The new-password fields do not match.");
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 72) {
      setError("The new password must contain 12 to 72 characters.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("The new password must be different from the current password.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: "same-origin",
      });
      const body = (await response.json()) as {
        error?: string;
        data?: { changed?: boolean };
      };

      if (!response.ok) {
        throw new Error(body.error ?? "The password could not be changed.");
      }

      onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The password could not be changed.",
      );
      setBusy(false);
    }
  }

  function toggle(field: PasswordField) {
    setVisible((current) => ({ ...current, [field]: !current[field] }));
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}>
      <div
        ref={dialogRef}
        className="password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        tabIndex={-1}>
        <div className="password-dialog-header">
          <div className="password-dialog-icon" aria-hidden="true">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 id="change-password-title">Change password</h2>
            <p>You will be signed out from all devices after this change.</p>
          </div>
          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close change password dialog">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit}>
          <PasswordInput
            label="Current password"
            value={currentPassword}
            visible={visible.current}
            autoComplete="current-password"
            onChange={setCurrentPassword}
            onToggle={() => toggle("current")}
            autoFocus
          />
          <PasswordInput
            label="New password"
            value={newPassword}
            visible={visible.new}
            autoComplete="new-password"
            onChange={setNewPassword}
            onToggle={() => toggle("new")}
            hint="Use 12 to 72 characters."
          />
          <PasswordInput
            label="Confirm new password"
            value={confirmPassword}
            visible={visible.confirm}
            autoComplete="new-password"
            onChange={setConfirmPassword}
            onToggle={() => toggle("confirm")}
          />

          {error ? <div className="password-dialog-error">{error}</div> : null}

          <div className="dialog-actions">
            <button
              type="button"
              className="dialog-secondary"
              onClick={onClose}
              disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="dialog-primary" disabled={busy}>
              {busy ? "Changing…" : "Change password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  visible,
  autoComplete,
  onChange,
  onToggle,
  hint,
  autoFocus = false,
}: {
  label: string;
  value: string;
  visible: boolean;
  autoComplete: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="password-dialog-field">
      <span>{label}</span>
      <div>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={label === "Current password" ? undefined : 12}
          maxLength={72}
          required
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

