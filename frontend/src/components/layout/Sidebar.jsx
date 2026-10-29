import { NavLink, useLocation } from "react-router-dom";
import { useAppSelector } from "../../app/hooks";
import { canRaiseMemos, hasOversight, isAdmin } from "../../utils/permissions";

/* ── Inline SVG icons (no external dependency) ─────────────────────────── */
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  dashboard: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  inbox:     "M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z",
  mine:      "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  all:       "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  compose:   "M12 20h9 M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z",
  routes:    "M6 3v12 M18 9a3 3 0 100-6 3 3 0 000 6z M6 21a3 3 0 100-6 3 3 0 000 6z M18 9a9 9 0 01-9 9",
  users:     "M12 11a4 4 0 100-8 4 4 0 000 8z M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1",
};

// Memo boxes share one path (/memos?box=…), so "active" also compares the box.
const NavItem = ({ to, iconKey, label, onClick, box }) => {
  const { pathname, search } = useLocation();
  const current = new URLSearchParams(search).get("box") ?? "inbox";
  const boxActive = box ? pathname === "/memos" && current === box : undefined;
  return (
    <NavLink
      to={to}
      end={Boolean(box)}
      onClick={onClick}
      className={({ isActive }) => `sidebar-link${(box ? boxActive : isActive) ? " active" : ""}`}
    >
      <Icon d={icons[iconKey]} />
      <span>{label}</span>
    </NavLink>
  );
};

export default function Sidebar({ open, onClose }) {
  const { user } = useAppSelector((state) => state.auth);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`sidebar-overlay${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside id="app-sidebar" className={`sidebar${open ? " open" : ""}`} aria-label="Main navigation">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-logo">F</div>
          <div className="sidebar-brand-text">
            <h3>FlowEngine</h3>
            <span>Memo routing</span>
          </div>
        </div>

        {/* Main navigation */}
        <div className="sidebar-section">
          <p className="sidebar-section-label">Overview</p>
          <nav className="sidebar-nav">
            <NavItem to="/dashboard" iconKey="dashboard" label="Dashboard" onClick={onClose} />
          </nav>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-section-label">Memos</p>
          <nav className="sidebar-nav">
            {canRaiseMemos(user) && <NavItem to="/memos?box=inbox" box="inbox" iconKey="inbox" label="Inbox" onClick={onClose} />}
            {canRaiseMemos(user) && <NavItem to="/memos?box=mine" box="mine" iconKey="mine" label="My memos" onClick={onClose} />}
            {hasOversight(user) && <NavItem to="/memos?box=all" box="all" iconKey="all" label="All memos" onClick={onClose} />}
            {canRaiseMemos(user) && <NavItem to="/memos/new" iconKey="compose" label="New memo" onClick={onClose} />}
          </nav>
        </div>

        {isAdmin(user) && (
          <div className="sidebar-section">
            <p className="sidebar-section-label">Administration</p>
            <nav className="sidebar-nav">
              <NavItem to="/routes" iconKey="routes" label="Approval routes" onClick={onClose} />
              <NavItem to="/users" iconKey="users" label="Users & access" onClick={onClose} />
            </nav>
          </div>
        )}
      </aside>
    </>
  );
}
