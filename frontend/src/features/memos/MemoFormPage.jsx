import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { memosApi, routesApi } from "../../api/memosApi";
import Field from "../../components/common/Field";
import Loader from "../../components/common/Loader";
import PageHeader from "../../components/common/PageHeader";
import useApiData from "../../hooks/useApiData";
import usePlatformConfig from "../../hooks/usePlatformConfig";
import { getErrorMessage, getFieldErrors } from "../../utils/errors";
import { validateMemo } from "../../utils/validation";

const EMPTY = { title: "", body: "", priority: "NORMAL", route: "" };

/** New memo (/memos/new) or edit a draft / returned memo (/memos/:id/edit). */
export default function MemoFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { limits, priorities } = usePlatformConfig();
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ saving: false, error: "", fieldErrors: {} });

  const routes = useApiData(({ signal }) => routesApi.list({}, { signal }), [], { fallbackError: "Could not load routes." });
  const existing = useApiData(
    ({ signal }) => (editing ? memosApi.get(id, { signal }) : Promise.resolve(null)),
    [id],
    { fallbackError: "Could not load the memo." }
  );

  useEffect(() => {
    const memo = existing.data;
    if (memo) setForm({ title: memo.title, body: memo.body, priority: memo.priority, route: String(memo.route) });
  }, [existing.data]);

  if ((editing && !existing.data) || !routes.data) {
    const err = existing.error || routes.error;
    return err ? <div className="alert error">{err}</div> : <Loader text="Loading…" />;
  }
  if (editing && !existing.data.allowed.edit) {
    return <div className="alert warning">This memo can no longer be edited. <Link to={`/memos/${id}`}>Back to the memo</Link></div>;
  }

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  const selectedRoute = routes.data.find((r) => String(r.id) === form.route);

  const save = async (andSubmit) => {
    const fieldErrors = validateMemo(form, limits);
    if (Object.keys(fieldErrors).length) {
      setState({ saving: false, error: "", fieldErrors });
      return;
    }
    setState({ saving: true, error: "", fieldErrors: {} });
    const payload = { title: form.title.trim(), body: form.body.trim(), priority: form.priority, route: Number(form.route) };
    try {
      const memo = editing ? await memosApi.update(id, payload) : await memosApi.create(payload);
      if (andSubmit) await memosApi.act(memo.id, "submit");
      navigate(`/memos/${memo.id}`, { replace: true });
    } catch (error) {
      setState({ saving: false, error: getErrorMessage(error, "Could not save the memo."), fieldErrors: getFieldErrors(error) });
    }
  };

  const fe = state.fieldErrors;
  const resubmitting = editing && existing.data.status === "RETURNED";

  return (
    <div className="memo-form-page">
      <PageHeader
        title={editing ? `Edit ${existing.data.reference ?? "draft"}` : "New memo"}
        subtitle={resubmitting
          ? "Make the changes requested, then resubmit. Review starts again from the first step."
          : "Save a draft to finish later, or submit it to start the approval route."}
      />

      <form className="card" onSubmit={(e) => { e.preventDefault(); save(true); }} noValidate>
        <div className="card-body grid-form">
          <Field label="Title" error={fe.title} className="full-width">
            <input name="title" value={form.title} onChange={change} maxLength={200} disabled={state.saving} autoFocus />
          </Field>

          <Field label="Route" error={fe.route} hint="Who the memo goes to, in order.">
            <select name="route" value={form.route} onChange={change} disabled={state.saving}>
              <option value="">Choose a route…</option>
              {routes.data.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>

          <Field label="Priority" error={fe.priority}>
            <select name="priority" value={form.priority} onChange={change} disabled={state.saving}>
              {priorities.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>

          {selectedRoute && (
            <div className="full-width route-preview" aria-live="polite">
              {selectedRoute.steps.map((s, i) => (
                <span key={s.order} className="route-chip">
                  {i > 0 && <span className="route-arrow" aria-hidden="true">→</span>}
                  <strong>{s.title}</strong> {s.approver.name}
                </span>
              ))}
            </div>
          )}

          <Field
            label="Memo"
            error={fe.body}
            hint={limits ? `${form.body.length} / ${limits.memo_body_max_length} characters` : undefined}
            className="full-width"
          >
            <textarea name="body" value={form.body} onChange={change} rows={14} disabled={state.saving}
              placeholder="Background, request and recommendation…" />
          </Field>
        </div>

        {state.error && <div className="alert error card-alert" role="alert">{state.error}</div>}

        <div className="dialog-actions card-actions">
          <Link to={editing ? `/memos/${id}` : "/memos?box=mine"} className="btn btn-ghost">Cancel</Link>
          <button type="button" className="btn btn-secondary" onClick={() => save(false)} disabled={state.saving}>
            Save draft
          </button>
          <button type="submit" className="btn btn-primary" disabled={state.saving}>
            {state.saving ? "Saving…" : resubmitting ? "Save and resubmit" : "Save and submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
