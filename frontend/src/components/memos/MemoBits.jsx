import { Link } from "react-router-dom";
import { daysSince, formatWaiting } from "../../utils/memo";
import { formatDateTime } from "../../utils/formatters";

const STATUS_BADGE = {
  DRAFT: "badge-neutral",
  IN_REVIEW: "badge-blue",
  RETURNED: "badge-amber",
  APPROVED: "badge-green",
  REJECTED: "badge-red",
  WITHDRAWN: "badge-neutral",
};

export function StatusBadge({ status, label }) {
  return <span className={`badge ${STATUS_BADGE[status] ?? "badge-neutral"}`}>{label ?? status}</span>;
}

export function PriorityBadge({ priority }) {
  if (priority !== "URGENT") return null;
  return <span className="badge badge-red">Urgent</span>;
}

/** "Waiting 4 days" in amber once past the configured step target. */
export function WaitingLabel({ since, targetDays }) {
  if (!since) return <span className="muted-small">—</span>;
  const overdue = targetDays != null && daysSince(since) > targetDays;
  return (
    <span className={overdue ? "waiting overdue" : "waiting"} title={`Since ${formatDateTime(since)}`}>
      {formatWaiting(since)}{overdue && " · overdue"}
    </span>
  );
}

export function Person({ person, showDesignation = true }) {
  if (!person) return <span className="muted-small">—</span>;
  return (
    <span className="person">
      <span className="person-name">{person.name}</span>
      {showDesignation && person.designation && <span className="person-role">{person.designation}</span>}
    </span>
  );
}

const ALL_COLUMNS = ["from", "status", "with", "waiting"];

/**
 * One row per memo, used by the dashboard lists and the memo tables.
 * `columns` drops what the context already says (your inbox needn't say "with you").
 */
export function MemoTable({ memos, targetDays, emptyText = "No memos.", columns = ALL_COLUMNS }) {
  if (!memos.length) return <p className="empty-cell">{emptyText}</p>;
  const show = (c) => columns.includes(c);
  return (
    <div className="table-wrap">
      <table className="data-table memo-table">
        <thead>
          <tr>
            <th>Memo</th>
            {show("from") && <th>From</th>}
            {show("status") && <th>Status</th>}
            {show("with") && <th>With</th>}
            {show("waiting") && <th>Waiting</th>}
          </tr>
        </thead>
        <tbody>
          {memos.map((m) => (
            <tr key={m.id}>
              <td>
                <Link to={`/memos/${m.id}`} className="memo-link">{m.title}</Link>
                <div className="memo-meta">
                  <span className="mono">{m.reference ?? "Draft"}</span>
                  <PriorityBadge priority={m.priority} />
                </div>
              </td>
              {show("from") && <td><Person person={m.originator} /></td>}
              {show("status") && <td><StatusBadge status={m.status} label={m.status_label} /></td>}
              {show("with") && (
                <td>
                  {m.current_step
                    ? <Person person={m.current_step.approver} />
                    : <span className="muted-small">—</span>}
                  {m.current_step && (
                    <div className="muted-small">Step {m.current_step.order} of {m.step_count}</div>
                  )}
                </td>
              )}
              {show("waiting") && <td><WaitingLabel since={m.current_step?.received_at} targetDays={targetDays} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STEP_MARK = { APPROVED: "✓", REJECTED: "✕", RETURNED: "↩", SKIPPED: "–" };

/** The memo's route as a vertical tracker: who has acted, who has it now, who is next. */
export function StepTracker({ steps, targetDays }) {
  return (
    <ol className="step-tracker">
      {steps.map((s) => (
        <li key={s.order} className={`step step-${s.status.toLowerCase()}`}>
          <span className="step-dot" aria-hidden="true">{STEP_MARK[s.status] ?? s.order}</span>
          <div className="step-body">
            <div className="step-head">
              <strong>{s.title}</strong>
              <span className="muted-small">{s.status_label}</span>
            </div>
            <Person person={s.approver} />
            {s.status === "PENDING" && <WaitingLabel since={s.received_at} targetDays={targetDays} />}
            {s.acted_at && <div className="muted-small">{formatDateTime(s.acted_at)}</div>}
            {s.comment && <blockquote className="step-comment">{s.comment}</blockquote>}
          </div>
        </li>
      ))}
    </ol>
  );
}
