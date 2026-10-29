import { Link } from "react-router-dom";
import { memosApi } from "../../api/memosApi";
import { useAppSelector } from "../../app/hooks";
import LiveStatus from "../../components/common/LiveStatus";
import Loader from "../../components/common/Loader";
import PageHeader from "../../components/common/PageHeader";
import { MemoTable } from "../../components/memos/MemoBits";
import useApiData from "../../hooks/useApiData";
import usePlatformConfig from "../../hooks/usePlatformConfig";
import { formatDuration } from "../../utils/memo";
import { canRaiseMemos } from "../../utils/permissions";

function Stat({ label, value, hint, to, tone }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className={`stat-value${tone ? ` tone-${tone}` : ""}`}>{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  return to ? <Link to={to} className="stat-card stat-link">{body}</Link> : <div className="stat-card">{body}</div>;
}

export default function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const { refreshMs, stepTargetDays } = usePlatformConfig();
  const { data, loading, error, updatedAt, reload } = useApiData(
    ({ signal }) => memosApi.dashboard({ signal }),
    [],
    { fallbackError: "Could not load the dashboard.", refreshMs }
  );

  if (!data) return loading ? <Loader text="Loading dashboard…" /> : <div className="alert error">{error}</div>;

  const closedTotal = data.closed.approved + data.closed.rejected + data.closed.withdrawn;
  // Auditors neither raise nor receive memos: their dashboard is the organisation view only.
  const personal = canRaiseMemos(user);
  const org = data.oversight;

  return (
    <div>
      <div className="page-toolbar">
        <PageHeader title="Dashboard"
          subtitle={personal ? "What is waiting for you, and where your own memos are." : "How memos are moving across the organisation."} />
        <div className="actions-row">
          <LiveStatus updatedAt={updatedAt} refreshMs={refreshMs} loading={loading} error={error} onRefresh={reload} />
          {canRaiseMemos(user) && <Link to="/memos/new" className="btn btn-primary">+ New memo</Link>}
        </div>
      </div>

      {data.awaiting_me_overdue > 0 && (
        <div className="alert warning" role="status">
          {data.awaiting_me_overdue} memo{data.awaiting_me_overdue === 1 ? " has" : "s have"} been waiting on you
          longer than {data.step_target_days} days.
        </div>
      )}

      {personal && (
        <div className="stats-grid stats-grid-3">
          <Stat label="Awaiting my action" value={data.awaiting_me} to="/memos?box=inbox"
            tone={data.awaiting_me_overdue ? "warn" : undefined}
            hint={data.awaiting_me_overdue ? `${data.awaiting_me_overdue} overdue` : "None overdue"} />
          <Stat label="My memos in review" value={data.my_in_review} to="/memos?box=mine&status=IN_REVIEW" />
          <Stat label="Returned to me" value={data.my_returned} to="/memos?box=mine&status=RETURNED"
            tone={data.my_returned ? "warn" : undefined} hint={data.my_returned ? "Needs your changes" : undefined} />
        </div>
      )}

      {org && (
        <>
          <h2 className="section-title">Across the organisation</h2>
          <div className="stats-grid stats-grid-3">
            <Stat label="In review" value={org.in_review} to="/memos?box=all&status=IN_REVIEW" />
            <Stat label="Steps overdue" value={org.overdue_steps} tone={org.overdue_steps ? "warn" : undefined}
              hint={`Waiting longer than ${data.step_target_days} days`} />
            <Stat label="Returned for changes" value={org.returned} to="/memos?box=all&status=RETURNED" />
          </div>
        </>
      )}

      <div className="stats-grid stats-grid-3">
        {personal && <Stat label="My drafts" value={data.my_drafts} to="/memos?box=mine&status=DRAFT" />}
        <Stat label={`Closed, last ${data.window_days} days`} value={closedTotal}
          hint={`${data.closed.approved} approved · ${data.closed.rejected} rejected`} />
        <Stat label="Average approval time" value={formatDuration(data.avg_approval_hours)}
          hint={`Submission to final approval, last ${data.window_days} days`} />
      </div>

      {!personal && (
        <section className="card">
          <div className="card-body">
            <p>Every submitted memo and its full history is in <Link to="/memos?box=all">All memos</Link>.
              You can comment on any memo, but not change its status.</p>
          </div>
        </section>
      )}

      {personal && <div className="page-grid">
        <section className="card">
          <div className="card-header">
            <h3>Waiting on you</h3>
            <Link to="/memos?box=inbox" className="card-header-meta">See all →</Link>
          </div>
          <div className="card-body no-pad">
            <MemoTable memos={data.inbox} targetDays={stepTargetDays} columns={["from", "waiting"]}
              emptyText="Nothing is waiting on you." />
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>My recent memos</h3>
            <Link to="/memos?box=mine" className="card-header-meta">See all →</Link>
          </div>
          <div className="card-body no-pad">
            <MemoTable memos={data.recent_mine} targetDays={stepTargetDays} columns={["status", "with"]}
              emptyText="You haven't raised any memos yet." />
          </div>
        </section>
      </div>}
    </div>
  );
}
