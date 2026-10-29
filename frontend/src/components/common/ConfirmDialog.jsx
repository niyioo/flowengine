import { useEffect, useRef } from "react";

/** Simple yes/no confirmation built on the native <dialog> (focus trap + Esc for free). */
export default function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", tone = "danger", busy, error, onConfirm, onCancel }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} className="dialog" onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
      <h3 className="dialog-title">{title}</h3>
      <p className="dialog-text">{description}</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={`btn btn-${tone}`} onClick={onConfirm} disabled={busy} autoFocus>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
