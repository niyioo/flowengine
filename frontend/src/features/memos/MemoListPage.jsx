import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { memosApi } from "../../api/memosApi";
import { useAppSelector } from "../../app/hooks";
import Loader from "../../components/common/Loader";
import PageHeader from "../../components/common/PageHeader";
import { MemoTable } from "../../components/memos/MemoBits";
import useApiData from "../../hooks/useApiData";
import usePlatformConfig from "../../hooks/usePlatformConfig";
import { canRaiseMemos, hasOversight } from "../../utils/permissions";

const BOXES = {
  inbox: { title: "Inbox", subtitle: "Memos waiting for your decision, oldest first.", ordering: "submitted_at" },
  mine: { title: "My memos", subtitle: "Everything you have raised, including drafts.", ordering: "-updated_at" },
  all: { title: "All memos", subtitle: "Every memo you can see.", ordering: "-updated_at" },
};

function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function MemoListPage() {
  const user = useAppSelector((s) => s.auth.user);
  const { statuses, refreshMs, stepTargetDays } = usePlatformConfig();
  const [params, setParams] = useSearchParams();
  // Auditors never raise or receive memos, so only "all" applies to them.
  const tabs = canRaiseMemos(user) ? ["inbox", "mine", ...(hasOversight(user) ? ["all"] : [])] : ["all"];
  const box = tabs.includes(params.get("box")) ? params.get("box") : tabs[0];
  const status = params.get("status") ?? "";
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim());
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [box, status, query]);

  const { data, loading, error } = useApiData(
    ({ signal }) => memosApi.list({ box, status, search: query, ordering: BOXES[box].ordering, page }, { signal }),
    [box, status, query, page],
    { fallbackError: "Could not load memos.", refreshMs: box === "inbox" ? refreshMs : null }
  );

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const memos = data?.results ?? [];

  return (
    <div>
      <div className="page-toolbar">
        <PageHeader title={BOXES[box].title} subtitle={BOXES[box].subtitle} />
        {canRaiseMemos(user) && <Link to="/memos/new" className="btn btn-primary">+ New memo</Link>}
      </div>

      <div className="tabs" role="tablist">
        {tabs.map((key) => (
          <button key={key} role="tab" aria-selected={box === key} className={`tab${box === key ? " active" : ""}`}
            onClick={() => setParam("box", key)}>
            {BOXES[key].title}
          </button>
        ))}
      </div>

      <div className="filter-bar" role="search">
        <div className="form-group grow">
          <label htmlFor="memo-search">Search</label>
          <input id="memo-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Reference, title or text" />
        </div>
        {box !== "inbox" && (
          <div className="form-group">
            <label htmlFor="memo-status">Status</label>
            <select id="memo-status" value={status} onChange={(e) => setParam("status", e.target.value)}>
              <option value="">Any status</option>
              {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}
      <section className="card">
        <div className="card-body no-pad">
          {loading && !data ? <Loader text="Loading memos…" /> : (
            <MemoTable memos={memos} targetDays={stepTargetDays}
              columns={box === "inbox" ? ["from", "waiting"] : box === "mine" ? ["status", "with", "waiting"] : undefined}
              emptyText={box === "inbox" ? "Nothing is waiting on you." : "No memos match."} />
          )}
        </div>
      </section>

      {data && (data.next || data.previous) && (
        <div className="pager">
          <button className="btn btn-ghost btn-sm" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>← Previous</button>
          <span className="muted-small">Page {page} · {data.count} memos</span>
          <button className="btn btn-ghost btn-sm" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
