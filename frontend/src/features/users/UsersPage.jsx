import { useEffect, useState } from "react";
import { usersApi } from "../../api/usersApi";
import { useAppSelector } from "../../app/hooks";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import EmptyState from "../../components/common/EmptyState";
import Loader from "../../components/common/Loader";
import PageHeader from "../../components/common/PageHeader";
import useApiData from "../../hooks/useApiData";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/formatters";
import { ROLES } from "../../utils/permissions";
import UserDialog, { ROLE_INFO } from "./UserDialog";

const ROLE_BADGE = { [ROLES.ADMIN]: "badge-blue", [ROLES.STAFF]: "badge-green", [ROLES.AUDITOR]: "badge-amber" };

function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function UsersPage() {
  const me = useAppSelector((s) => s.auth.user);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("true");
  const debouncedSearch = useDebounced(search.trim());

  const [editing, setEditing] = useState({ open: false, user: null });
  const [confirm, setConfirm] = useState({ user: null, busy: false, error: "" });
  const [notice, setNotice] = useState("");

  const { data, loading, error, reload } = useApiData(
    ({ signal }) => usersApi.list({ search: debouncedSearch, role, is_active: status, ordering: "username" }, { signal }),
    [debouncedSearch, role, status],
    { fallbackError: "Failed to load users." }
  );
  const users = data?.results ?? [];
  const total = data?.count ?? users.length;

  const onSaved = (user, action) => {
    setEditing({ open: false, user: null });
    setNotice(`User ${user.username} ${action}.`);
    reload();
  };

  const toggleActive = async () => {
    const target = confirm.user;
    setConfirm((c) => ({ ...c, busy: true, error: "" }));
    try {
      if (target.is_active) await usersApi.deactivate(target.id);
      else await usersApi.update(target.id, { is_active: true });
      setConfirm({ user: null, busy: false, error: "" });
      setNotice(`User ${target.username} ${target.is_active ? "deactivated and signed out everywhere" : "reactivated"}.`);
      reload();
    } catch (err) {
      setConfirm((c) => ({ ...c, busy: false, error: getErrorMessage(err, "Could not update the user.") }));
    }
  };

  return (
    <div>
      <div className="page-toolbar">
        <PageHeader title="Users & access" subtitle="Create accounts, assign roles and revoke access. Users are deactivated, never deleted, so the memos they handled keep their history." />
        <button className="btn btn-primary" onClick={() => { setNotice(""); setEditing({ open: true, user: null }); }}>
          + New user
        </button>
      </div>

      <div className="filter-bar" role="search">
        <div className="form-group grow">
          <label htmlFor="user-search">Search</label>
          <input id="user-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, username, email or department" />
        </div>
        <div className="form-group">
          <label htmlFor="user-role">Role</label>
          <select id="user-role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {Object.entries(ROLE_INFO).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="user-status">Status</label>
          <select id="user-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
            <option value="">All</option>
          </select>
        </div>
      </div>

      {notice && <div className="alert success" role="status" style={{ marginBottom: "var(--space-4)" }}>{notice}</div>}
      {error && <div className="alert error" role="alert" style={{ marginBottom: "var(--space-4)" }}>{error}</div>}

      <section className="card" aria-labelledby="users-title">
        <div className="card-header">
          <h3 id="users-title">Accounts</h3>
          <span className="muted-small">{total > users.length ? `Showing ${users.length} of ${total} — refine the search` : `${total} user${total === 1 ? "" : "s"}`}</span>
        </div>
        <div className="card-body no-pad" aria-busy={loading}>
          {loading && !data ? <Loader text="Loading users…" /> : users.length === 0 ? (
            <EmptyState title="No users match" message="Try a different search or filter." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last sign-in</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === me?.id;
                    return (
                      <tr key={u.id} className={u.is_active ? undefined : "row-muted"}>
                        <td>
                          <div className="strong">{u.full_name || u.username}{isSelf && <span className="muted-small"> (you)</span>}</div>
                          <div className="muted small-text">{u.username} · {u.email}</div>
                          {(u.designation || u.department) && (
                            <div className="muted small-text">{[u.designation, u.department].filter(Boolean).join(" · ")}</div>
                          )}
                        </td>
                        <td className="nowrap">
                          <span className={`badge ${ROLE_BADGE[u.role] ?? "badge-neutral"}`}>{ROLE_INFO[u.role]?.label ?? u.role}</span>
                          {u.is_superuser && (
                            <span className="badge badge-red" style={{ marginLeft: 4 }} title="Full Django admin access regardless of role">superuser</span>
                          )}
                        </td>
                        <td><span className={`badge ${u.is_active ? "badge-green" : "badge-neutral"}`}>{u.is_active ? "Active" : "Deactivated"}</span></td>
                        <td className="muted nowrap small-text">{u.last_login ? formatDateTime(u.last_login) : "Never"}</td>
                        <td className="num nowrap">
                          <button className="btn btn-ghost btn-sm" onClick={() => { setNotice(""); setEditing({ open: true, user: u }); }}
                            aria-label={`Edit ${u.username}`}>
                            Edit
                          </button>{" "}
                          {!isSelf && (
                            <button
                              className={`btn btn-sm ${u.is_active ? "btn-danger" : "btn-ghost"}`}
                              onClick={() => { setNotice(""); setConfirm({ user: u, busy: false, error: "" }); }}
                              aria-label={`${u.is_active ? "Deactivate" : "Reactivate"} ${u.username}`}
                            >
                              {u.is_active ? "Deactivate" : "Reactivate"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <UserDialog
        open={editing.open}
        user={editing.user}
        currentUserId={me?.id}
        onClose={() => setEditing({ open: false, user: null })}
        onSaved={onSaved}
      />

      <ConfirmDialog
        open={Boolean(confirm.user)}
        title={confirm.user?.is_active ? `Deactivate ${confirm.user?.username}?` : `Reactivate ${confirm.user?.username}?`}
        description={confirm.user?.is_active
          ? "They will be signed out on every device immediately and will not be able to sign in. Their production and delivery records are kept."
          : "They will be able to sign in again with their existing password."}
        confirmLabel={confirm.user?.is_active ? "Deactivate" : "Reactivate"}
        tone={confirm.user?.is_active ? "danger" : "primary"}
        busy={confirm.busy}
        error={confirm.error}
        onConfirm={toggleActive}
        onCancel={() => setConfirm({ user: null, busy: false, error: "" })}
      />
    </div>
  );
}
