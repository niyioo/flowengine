import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { loginUser } from "./authThunks";
import { clearAuthError } from "./authSlice";
import Loader from "../../components/common/Loader";

const EyeIcon = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open
      ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
      : <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
    }
  </svg>
);

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const { user, loading, error, sessionExpired, initializing, offline } = useAppSelector((state) => state.auth);
  const location = useLocation();

  const [form, setForm]             = useState({ username: "", password: "" });
  const [showPassword, setShowPass] = useState(false);

  if (user) return <Navigate to={location.state?.from || "/dashboard"} replace />;
  if (initializing) {
    return (
      <div className="auth-page">
        <Loader text="Checking your session…" />
      </div>
    );
  }

  const handleChange = (e) => {
    if (error || sessionExpired) dispatch(clearAuthError());
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(loginUser(form));
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Brand */}
        <div className="auth-logo-wrap">
          <div className="auth-logo">F</div>
          <div className="auth-brand">
            <h1>FlowEngine</h1>
            <p>Memo routing & approvals</p>
          </div>
        </div>

        <h2 className="auth-heading">Sign in to your account</h2>
        <p className="auth-sub">Enter your credentials to see the memos waiting for you.</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={form.username}
              onChange={handleChange}
              placeholder="Enter your username"
              required
              disabled={loading}
            />
          </div>

          <div style={{ position: "relative" }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              placeholder="Enter your password"
              required
              disabled={loading}
              style={{ paddingRight: "44px" }}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              style={{
                position: "absolute", right: 12, bottom: 10,
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", padding: 0,
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>

          {offline && !error && (
            <div className="alert warning" role="status">Cannot reach the server. Check your connection, then sign in.</div>
          )}

          {sessionExpired && !error && (
            <div className="alert info" role="status">Your session has expired. Please sign in again.</div>
          )}

          {error && (
            <div className="alert error" role="alert">
              {typeof error === "string" ? error : "Login failed. Please try again."}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading || !form.username || !form.password}
          >
            {loading
              ? <><span className="loader-spinner" style={{ width: 16, height: 16 }} /> Signing in…</>
              : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
