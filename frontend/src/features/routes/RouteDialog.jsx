import { useEffect, useRef, useState } from "react";
import { routesApi } from "../../api/memosApi";
import Field from "../../components/common/Field";
import usePlatformConfig from "../../hooks/usePlatformConfig";
import { getErrorMessage, getFieldErrors } from "../../utils/errors";
import { ROLES } from "../../utils/permissions";
import { validateRoute } from "../../utils/validation";

const blankStep = () => ({ key: crypto.randomUUID(), title: "", approver: "" });
const EMPTY = { name: "", description: "", is_active: true, steps: [] };

/** Create (route = null) or edit an approval route. Memos already in flight keep their old steps. */
export default function RouteDialog({ open, route, people, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const { limits } = usePlatformConfig();
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ saving: false, error: "", fieldErrors: {} });
  const editing = Boolean(route);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setForm(editing
        ? {
          name: route.name, description: route.description, is_active: route.is_active,
          steps: route.steps.map((s) => ({ key: crypto.randomUUID(), title: s.title, approver: s.approver.id })),
        }
        : { ...EMPTY, steps: [blankStep()] });
      setState({ saving: false, error: "", fieldErrors: {} });
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, editing, route]);

  const setStep = (key, patch) => setForm((f) => ({ ...f, steps: f.steps.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const move = (index, delta) => setForm((f) => {
    const steps = [...f.steps];
    const [step] = steps.splice(index, 1);
    steps.splice(index + delta, 0, step);
    return { ...f, steps };
  });
  const remove = (key) => setForm((f) => ({ ...f, steps: f.steps.filter((s) => s.key !== key) }));

  const submit = async (e) => {
    e.preventDefault();
    const fieldErrors = validateRoute(form, limits);
    if (Object.keys(fieldErrors).length) return setState({ saving: false, error: "", fieldErrors });
    setState({ saving: true, error: "", fieldErrors: {} });
    const payload = {
      name: form.name.trim(), description: form.description.trim(), is_active: form.is_active,
      steps: form.steps.map((s) => ({ title: s.title.trim(), approver: s.approver })),
    };
    try {
      const saved = editing ? await routesApi.update(route.id, payload) : await routesApi.create(payload);
      onSaved(saved, editing ? "updated" : "created");
    } catch (error) {
      setState({ saving: false, error: getErrorMessage(error, "Could not save the route."), fieldErrors: getFieldErrors(error) });
    }
  };

  const fe = state.fieldErrors;
  const maxSteps = limits?.max_route_steps;

  return (
    <dialog ref={dialogRef} className="dialog dialog-wide" onCancel={(e) => { e.preventDefault(); if (!state.saving) onClose(); }}>
      <form onSubmit={submit} noValidate>
        <h3 className="dialog-title">{editing ? `Edit ${route.name}` : "New route"}</h3>
        <p className="dialog-text">
          Steps run in order. {editing && "Memos already in review keep the steps they started with."}
        </p>

        <div className="grid-form">
          <Field label="Name" error={fe.name}>
            <input value={form.name} maxLength={120} disabled={state.saving}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Procurement approval" />
          </Field>
          <Field label="Status">
            <select value={form.is_active ? "true" : "false"} disabled={state.saving}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === "true" }))}>
              <option value="true">In use</option>
              <option value="false">Retired (hidden from new memos)</option>
            </select>
          </Field>
          <Field label="Description" error={fe.description} className="full-width">
            <input value={form.description} maxLength={500} disabled={state.saving}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="When staff should use this route" />
          </Field>
        </div>

        <div className="route-steps">
          <p className="form-label">Approval steps</p>
          {form.steps.map((s, i) => (
            <div key={s.key} className="route-step-row">
              <span className="route-step-num">{i + 1}</span>
              <input aria-label={`Step ${i + 1} title`} value={s.title} maxLength={120} disabled={state.saving}
                onChange={(e) => setStep(s.key, { title: e.target.value })} placeholder="e.g. Director review" />
              <select aria-label={`Step ${i + 1} approver`} value={s.approver} disabled={state.saving}
                onChange={(e) => setStep(s.key, { approver: e.target.value })}>
                <option value="">Approver…</option>
                {people.filter((p) => p.role !== ROLES.AUDITOR).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name || p.username}{p.designation ? ` · ${p.designation}` : ""}</option>
                ))}
              </select>
              <div className="route-step-tools">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0 || state.saving} aria-label="Move up">↑</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === form.steps.length - 1 || state.saving} aria-label="Move down">↓</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(s.key)} disabled={state.saving} aria-label="Remove step">✕</button>
              </div>
            </div>
          ))}
          {fe.steps && <span className="field-error" role="alert">{fe.steps}</span>}
          <button type="button" className="btn btn-secondary btn-sm" disabled={state.saving || (maxSteps && form.steps.length >= maxSteps)}
            onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, blankStep()] }))}>
            + Add step
          </button>
        </div>

        {state.error && <div className="alert error" role="alert">{state.error}</div>}

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={state.saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={state.saving}>
            {state.saving ? "Saving…" : editing ? "Save route" : "Create route"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
