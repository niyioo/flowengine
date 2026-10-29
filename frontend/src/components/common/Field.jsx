import { cloneElement, useId } from "react";

/**
 * Label + control + inline error, wired up for screen readers
 * (aria-invalid / aria-describedby). Pass the input as the only child.
 */
export default function Field({ label, error, hint, className = "", children }) {
  const id = useId();
  const messageId = `${id}-msg`;
  const control = cloneElement(children, {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? messageId : undefined,
  });

  return (
    <div className={`form-group ${className}`}>
      <label htmlFor={id}>{label}</label>
      {control}
      {error ? (
        <span id={messageId} className="field-error" role="alert">{error}</span>
      ) : hint ? (
        <span id={messageId} className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
