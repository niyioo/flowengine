export default function EmptyState({ title = "Nothing here yet", message, action }) {
  return (
    <div className="empty-state" role="status">
      <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <path d="M3.3 7L12 12l8.7-5M12 22V12" />
      </svg>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}
