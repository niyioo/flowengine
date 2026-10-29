export default function Loader({ text = "Loading…", inline = false }) {
  if (inline) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>
        <span className="loader-spinner" />
        {text}
      </span>
    );
  }
  return (
    <div className="loader">
      <span className="loader-spinner" />
      <span>{text}</span>
    </div>
  );
}
