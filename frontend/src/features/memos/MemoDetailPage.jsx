import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { memosApi } from "../../api/memosApi";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import Field from "../../components/common/Field";
import Loader from "../../components/common/Loader";
import { Person, PriorityBadge, StatusBadge, StepTracker } from "../../components/memos/MemoBits";
import useApiData from "../../hooks/useApiData";
import usePlatformConfig from "../../hooks/usePlatformConfig";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/formatters";
import { validateComment } from "../../utils/validation";

const DECISIONS = {
  approve: { label: "Approve", tone: "primary", needsComment: false, done: "Approved." },
  return: { label: "Return for changes", tone: "secondary", needsComment: true, done: "Returned to the originator." },
  reject: { label: "Reject", tone: "danger", needsComment: true, done: "Rejected." },
};

function DecisionPanel({ memo, limits, onDone }) {
  const [comment, setComment] = useState("");
  const [state, setState] = useState({ busy: "", error: "", fieldError: "" });

  const decide = async (verb) => {
    const fieldError = validateComment(comment, limits, { required: DECISIONS[verb].needsComment });
    if (fieldError) {
      setState({ busy: "", error: "", fieldError });
      return;
    }
    setState({ busy: verb, error: "", fieldError: "" });
    try {
      const updated = await memosApi.act(memo.id, verb, comment.trim());
      setComment("");
      setState({ busy: "", error: "", fieldError: "" });
      onDone(updated, DECISIONS[verb].done);
    } catch (error) {
      setState({ busy: "", error: getErrorMessage(error, "Could not record your decision."), fieldError: "" });
    }
  };

  const step = memo.current_step;
  return (
    <section className="card decision-panel">
      <div className="card-header"><h3>Your decision · {step.title}</h3></div>
      <div className="card-body">
        <Field label="Comment" error={state.fieldError}
          hint="Optional when approving. Required when returning or rejecting, so the originator knows what to do.">
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} disabled={Boolean(state.busy)} />
        </Field>
        {state.error && <div className="alert error" role="alert">{state.error}</div>}
        <div className="actions-row">
          {Object.entries(DECISIONS).map(([verb, d]) => (
            <button key={verb} className={`btn btn-${d.tone}`} onClick={() => decide(verb)} disabled={Boolean(state.busy)}>
              {state.busy === verb ? "Saving…" : d.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function CommentBox({ memo, limits, onDone }) {
  const [comment, setComment] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });

  const send = async (e) => {
    e.preventDefault();
    const error = validateComment(comment, limits, { required: true });
    if (error) return setState({ busy: false, error });
    setState({ busy: true, error: "" });
    try {
      onDone(await memosApi.act(memo.id, "comment", comment.trim()), "Comment added.");
      setComment("");
      setState({ busy: false, error: "" });
    } catch (err) {
      setState({ busy: false, error: getErrorMessage(err, "Could not add the comment.") });
    }
  };

  return (
    <form onSubmit={send} className="comment-box">
      <Field label="Add a comment" error={state.error}>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} disabled={state.busy}
          placeholder="Ask a question or add context. Comments don't change the memo's status." />
      </Field>
      <button className="btn btn-secondary btn-sm" disabled={state.busy}>{state.busy ? "Posting…" : "Post comment"}</button>
    </form>
  );
}

export default function MemoDetailPage() {
  const { id } = useParams();
  const { limits, stepTargetDays, refreshMs } = usePlatformConfig();
  const [notice, setNotice] = useState("");
  const [override, setOverride] = useState(null);
  const [withdraw, setWithdraw] = useState({ open: false, busy: false, error: "" });
  const [submitting, setSubmitting] = useState({ busy: false, error: "" });

  const { data, loading, error } = useApiData(
    ({ signal }) => memosApi.get(id, { signal }).then((m) => { setOverride(null); return m; }),
    [id],
    { fallbackError: "Could not load the memo.", refreshMs }
  );
  const memo = override ?? data;
  if (!memo) return loading ? <Loader text="Loading memo…" /> : <div className="alert error">{error}</div>;

  const updated = (next, message) => { setOverride(next); setNotice(message); };

  const submit = async () => {
    setSubmitting({ busy: true, error: "" });
    try {
      updated(await memosApi.act(memo.id, "submit"), "Submitted. It is now with the first approver.");
      setSubmitting({ busy: false, error: "" });
    } catch (err) {
      setSubmitting({ busy: false, error: getErrorMessage(err, "Could not submit the memo.") });
    }
  };

  const doWithdraw = async () => {
    setWithdraw((w) => ({ ...w, busy: true, error: "" }));
    try {
      updated(await memosApi.act(memo.id, "withdraw"), "Memo withdrawn.");
      setWithdraw({ open: false, busy: false, error: "" });
    } catch (err) {
      setWithdraw((w) => ({ ...w, busy: false, error: getErrorMessage(err, "Could not withdraw the memo.") }));
    }
  };

  const returned = memo.status === "RETURNED" && memo.steps.find((s) => s.status === "RETURNED");

  return (
    <div className="memo-detail">
      <div className="page-toolbar">
        <div className="page-header">
          <p className="memo-ref mono">{memo.reference ?? "Draft — no reference until submitted"}</p>
          <h1>{memo.title}</h1>
          <div className="memo-meta">
            <StatusBadge status={memo.status} label={memo.status_label} />
            <PriorityBadge priority={memo.priority} />
            <span className="muted-small">{memo.route_name}</span>
          </div>
        </div>
        <div className="actions-row">
          {memo.allowed.edit && <Link to={`/memos/${memo.id}/edit`} className="btn btn-secondary">Edit</Link>}
          {memo.allowed.submit && (
            <button className="btn btn-primary" onClick={submit} disabled={submitting.busy}>
              {submitting.busy ? "Submitting…" : memo.status === "RETURNED" ? "Resubmit" : "Submit"}
            </button>
          )}
          {memo.allowed.withdraw && (
            <button className="btn btn-ghost" onClick={() => setWithdraw({ open: true, busy: false, error: "" })}>Withdraw</button>
          )}
        </div>
      </div>

      {notice && <div className="alert success" role="status">{notice}</div>}
      {submitting.error && <div className="alert error" role="alert">{submitting.error}</div>}
      {returned && memo.allowed.edit && (
        <div className="alert warning" role="status">
          <strong>Returned by {returned.approver.name}:</strong> {returned.comment}
        </div>
      )}

      <div className="memo-layout">
        <div className="memo-main">
          {memo.allowed.decide && <DecisionPanel memo={memo} limits={limits} onDone={updated} />}

          <section className="card">
            <div className="card-header">
              <h3>Memo</h3>
              <span className="card-header-meta">Raised {formatDateTime(memo.created_at)}</span>
            </div>
            <div className="card-body">
              <div className="memo-from">From <Person person={memo.originator} />
                {memo.originator.department && <span className="muted-small"> · {memo.originator.department}</span>}
              </div>
              <div className="memo-body">{memo.body}</div>
            </div>
          </section>

          <section className="card">
            <div className="card-header"><h3>History</h3><span className="card-header-meta">Every action is recorded and cannot be edited.</span></div>
            <div className="card-body">
              <ol className="timeline">
                {memo.actions.map((a) => (
                  <li key={a.id} className={`timeline-item action-${a.action.toLowerCase()}`}>
                    <div className="timeline-head">
                      <strong>{a.actor.name}</strong> <span>{a.action_label.toLowerCase()}</span>
                      {a.step_order && <span className="muted-small"> · step {a.step_order}</span>}
                      <span className="muted-small timeline-time">{formatDateTime(a.created_at)}</span>
                    </div>
                    {a.comment && <p className="timeline-comment">{a.comment}</p>}
                  </li>
                ))}
              </ol>
              {memo.allowed.comment && <CommentBox memo={memo} limits={limits} onDone={updated} />}
            </div>
          </section>
        </div>

        <aside className="card memo-side">
          <div className="card-header"><h3>Route</h3></div>
          <div className="card-body">
            {memo.steps.length
              ? <StepTracker steps={memo.steps} targetDays={stepTargetDays} />
              : <p className="muted-small">The approval steps appear here once the memo is submitted.</p>}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={withdraw.open}
        title="Withdraw this memo?"
        description="It will be closed and removed from every approver's inbox. This cannot be undone; you would need to raise a new memo."
        confirmLabel="Withdraw memo"
        busy={withdraw.busy}
        error={withdraw.error}
        onConfirm={doWithdraw}
        onCancel={() => setWithdraw({ open: false, busy: false, error: "" })}
      />
    </div>
  );
}
