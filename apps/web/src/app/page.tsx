import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: 8 }}>Olink Desk</h1>
        <p style={{ color: "#555", marginBottom: 20 }}>
          Customer support, task &amp; call tracking for Ethiopian
          organizations.
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            borderRadius: 8,
            background: "#1d4ed8",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Staff sign in
        </Link>
      </div>
    </main>
  );
}
