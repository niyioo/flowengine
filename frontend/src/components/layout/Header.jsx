import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { logoutUser } from "../../features/auth/authThunks";

const HamburgerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6"  x2="21" y2="6"  />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const LogoutIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

function todayLabel() {
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  }).format(new Date());
}

function initials(user) {
  if (!user) return "?";
  const f = user.first_name?.[0] ?? "";
  const l = user.last_name?.[0] ?? "";
  return (f + l).toUpperCase() || (user.username?.[0]?.toUpperCase() ?? "U");
}

export default function Header({ onMenuToggle, menuOpen = false }) {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);

  const handleLogout = () => dispatch(logoutUser());

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name ?? ""}`.trim()
    : user?.username ?? "User";

  const roleLabel = user?.role
    ? user.role.charAt(0) + user.role.slice(1).toLowerCase()
    : "";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="sidebar-toggle" onClick={onMenuToggle} aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="app-sidebar">
          <HamburgerIcon />
        </button>
        <div>
          <p className="topbar-greeting">Welcome back, {user?.first_name || user?.username}</p>
          <p className="topbar-date">{todayLabel()}</p>
        </div>
      </div>

      <div className="topbar-right">
        <div className="user-chip">
          <div className="user-chip-avatar">{initials(user)}</div>
          <div>
            <span className="user-chip-name">{displayName}</span>
            {roleLabel && <span className="user-chip-role"> · {roleLabel}</span>}
          </div>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Sign out">
          <LogoutIcon />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
}
