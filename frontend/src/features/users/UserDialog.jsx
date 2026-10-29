import { useEffect, useRef, useState } from "react";
import { usersApi } from "../../api/usersApi";
import Field from "../../components/common/Field";
import usePlatformConfig from "../../hooks/usePlatformConfig";
import { getErrorMessage, getFieldErrors } from "../../utils/errors";
import { ROLES } from "../../utils/permissions";

export const ROLE_INFO = {
  [ROLES.ADMIN]: { label: "Admin", desc: "Manages users and approval routes, and sees every submitted memo." },
  [ROLES.STAFF]: { label: "Staff", desc: "Raises memos and decides on the ones routed to them." },
  [ROLES.AUDITOR]: { label: "Auditor", desc: "Reads every submitted memo and its history, and can comment. Cannot approve or raise memos." },
};

const EMPTY = { username: "", email: "", first_name: "", last_name: "", designation: "", department: "", role: ROLES.STAFF, password: "" };

/**
 * Create (user = null) or edit a user. On edit, the password field is optional
 * and only sent when filled in (to reset the user's password).
 */
export default function UserDialog({ open, user, currentUserId, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ saving: false, error: "", fieldErrors: {} });
  const editing = Boolean(user);
  const { limits } = usePlatformConfig();
  const isSelf = editing && user.id === currentUserId;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setForm(editing
        ? {
          username: user.username, email: user.email, first_name: user.first_name, last_name: user.last_name,
          designation: user.designation, department: user.department, role: user.role, password: "",
        }
        : EMPTY);
      setState({ saving: false, error: "", fieldErrors: {} });
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, editing, user]);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (state.saving) return;
    setState({ saving: true, error: "", fieldErrors: {} });

    const payload = {
      username: form.username.trim(),
      email: form.email.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      designation: form.designation.trim(),
      department: form.department.trim(),
      role: form.role,
    };
    if (form.password) payload.password = form.password;
    if (isSelf) delete payload.role; // the API refuses self role changes

    try {
      const saved = editing ? await usersApi.update(user.id, payload) : await usersApi.create(payload);
      onSaved(saved, editing ? "updated" : "created");
    } catch (error) {
      setState({ saving: false, error: getErrorMessage(error, "Could not save the user."), fieldErrors: getFieldErrors(error) });
    }
  };

  const fe = state.fieldErrors;
  const input = (name, props = {}) => (
    <input name={name} value={form[name]} onChange={change} disabled={state.saving} {...props} />
  );

  return (
    <dialog ref={dialogRef} className="dialog dialog-wide" onCancel={(e) => { e.preventDefault(); if (!state.saving) onClose(); }}>
      <form onSubmit={submit} noValidate>
        <h3 className="dialog-title">{editing ? `Edit ${user.username}` : "New user"}</h3>
        <p className="dialog-text">
          {editing ? "Leave the password blank to keep the current one." : "The user can sign in immediately with this password."}
        </p>

        <div className="grid-form">
          <Field label="Username" error={fe.username}>{input("username", { required: true, maxLength: 150, autoComplete: "off" })}</Field>
          <Field label="Email" error={fe.email}>{input("email", { type: "email", required: true, autoComplete: "off" })}</Field>
          <Field label="First name" error={fe.first_name}>{input("first_name", { maxLength: 150 })}</Field>
          <Field label="Last name" error={fe.last_name}>{input("last_name", { maxLength: 150 })}</Field>
          <Field label="Designation" error={fe.designation} hint="Shown on memos, e.g. Director, Finance">{input("designation", { maxLength: 120 })}</Field>
          <Field label="Department" error={fe.department}>{input("department", { maxLength: 120 })}</Field>

          <Field
            label="Role"
            error={fe.role}
            hint={isSelf ? "You cannot change your own role." : ROLE_INFO[form.role]?.desc}
            className="full-width"
          >
            <select name="role" value={form.role} onChange={change} disabled={state.saving || isSelf}>
              {Object.entries(ROLE_INFO).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
            </select>
          </Field>

          <Field
            label={editing ? "New password (optional)" : "Password"}
            error={fe.password}
            hint={`At least ${limits?.password_min_length ?? "the required number of"} characters; not too common, entirely numeric, or similar to the username.`}
            className="full-width"
          >
            {input("password", { type: "password", autoComplete: "new-password", required: !editing })}
          </Field>
        </div>

        {state.error && <div className="alert error" role="alert" style={{ marginTop: "var(--space-4)" }}>{state.error}</div>}

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={state.saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={state.saving}>
            {state.saving ? "Saving…" : editing ? "Save changes" : "Create user"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
