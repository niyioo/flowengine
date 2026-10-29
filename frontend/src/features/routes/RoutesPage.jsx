import { useState } from "react";
import { routesApi } from "../../api/memosApi";
import { usersApi } from "../../api/usersApi";
import EmptyState from "../../components/common/EmptyState";
import Loader from "../../components/common/Loader";
import PageHeader from "../../components/common/PageHeader";
import useApiData from "../../hooks/useApiData";
import { formatDateTime } from "../../utils/formatters";
import RouteDialog from "./RouteDialog";

export default function RoutesPage() {
  const [editing, setEditing] = useState({ open: false, route: null });
  const [notice, setNotice] = useState("");

  const routes = useApiData(({ signal }) => routesApi.list({ include_inactive: true }, { signal }), [],
    { fallbackError: "Could not load routes." });
  const people = useApiData(({ signal }) => usersApi.list({ is_active: true, ordering: "first_name" }, { signal }), [],
    { fallbackError: "Could not load users." });

  const onSaved = (route, action) => {
    setEditing({ open: false, route: null });
    setNotice(`Route “${route.name}” ${action}.`);
    routes.reload();
  };

  const list = routes.data ?? [];

  return (
    <div>
      <div className="page-toolbar">
        <PageHeader title="Approval routes"
          subtitle="The chains of approvers a memo can travel through. Retire a route instead of deleting it, so past memos keep their history." />
        <button className="btn btn-primary" disabled={!people.data}
          onClick={() => { setNotice(""); setEditing({ open: true, route: null }); }}>
          + New route
        </button>
      </div>

      {notice && <div className="alert success" role="status">{notice}</div>}
      {(routes.error || people.error) && <div className="alert error" role="alert">{routes.error || people.error}</div>}

      {routes.loading && !routes.data ? <Loader text="Loading routes…" /> : list.length === 0 ? (
        <EmptyState title="No routes yet" message="Create the first route so staff can start sending memos." />
      ) : (
        <div className="route-grid">
          {list.map((r) => (
            <section key={r.id} className={`card route-card${r.is_active ? "" : " retired"}`}>
              <div className="card-header">
                <h3>{r.name}</h3>
                {r.is_active ? <span className="badge badge-green">In use</span> : <span className="badge badge-neutral">Retired</span>}
              </div>
              <div className="card-body">
                {r.description && <p className="muted">{r.description}</p>}
                <ol className="route-list">
                  {r.steps.map((s) => (
                    <li key={s.order}><strong>{s.title}</strong> <span className="muted-small">{s.approver.name}{s.approver.designation ? ` · ${s.approver.designation}` : ""}</span></li>
                  ))}
                </ol>
                <div className="route-card-foot">
                  <span className="muted-small">Updated {formatDateTime(r.updated_at)}</span>
                  <button className="btn btn-ghost btn-sm" disabled={!people.data}
                    onClick={() => { setNotice(""); setEditing({ open: true, route: r }); }}>Edit</button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <RouteDialog open={editing.open} route={editing.route} people={people.data?.results ?? []}
        onClose={() => setEditing({ open: false, route: null })} onSaved={onSaved} />
    </div>
  );
}
